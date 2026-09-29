// Native macOS sampling (M4): processes, memory and listening ports from libproc and Mach calls
// (darwinFfi.js) instead of spawning ps, vm_stat, sysctl and lsof. Spawning `ps` every second cost about
// 2.5% of a core on its own; a native sample of ~600 processes costs about 1 ms.
//
// One limit: macOS only gives an unprivileged process the CPU/memory/start time of ITS OWN processes
// (/bin/ps is setuid root; htop has the same limit). Other users' processes (root daemons,
// WindowServer…) get those figures from a trimmed `ps` every 5 s instead. Run as root and everything is
// native. The native layer is a parameter, so this logic is tested with a fake under Node.
const path = require('node:path');
const { toolError } = require('./errors');
const { STATE_LABELS, parseEtime, memoryUsedMB, cachedMB, BYTES_PER_MB } = require('./darwinParsers');

/** @typedef {import('./types').ProcessInfo} ProcessInfo */
/** @typedef {import('./types').PortInfo} PortInfo */

// No user or comm column: resolving those is most of what makes a full `ps` expensive.
const OTHERS_PS_ARGS = ['-A', '-o', 'pid=,pcpu=,rss=,state=,etime='];
const OTHERS_REFRESH_MS = 5000;
const NS_PER_SECOND = 1e9;
// BSD process status (sys/proc.h): SSTOP 4, SZOMB 5.
const STATUS_STOPPED = 4;
const STATUS_ZOMBIE = 5;

/** Trimmed `ps` → pid → { cpuPercent, rssKB, state, startedAt }. */
function parseOthersPs(text, now) {
    const map = new Map();
    for (const line of text.split('\n')) {
        const match = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s*$/.exec(line);
        if (!match) continue;
        const [, pid, pcpu, rss, state, etime] = match;
        const elapsed = parseEtime(etime);
        map.set(Number(pid), {
            cpuPercent: Number(pcpu),
            rssKB: Number(rss),
            state: /** @type {import('./types').ProcessState} */ (STATE_LABELS[state[0]] || 'unknown'),
            startedAt: elapsed === null ? null : now - elapsed * 1000,
        });
    }
    return map;
}

/** @returns {import('./types').ProcessState} */
function stateOf(status, runningThreads) {
    if (status === STATUS_ZOMBIE) return 'zombie';
    if (status === STATUS_STOPPED) return 'stopped';
    return runningThreads > 0 ? 'running' : 'sleeping';
}

/**
 * @param {{ native: any, exec: import('./types').ExecFn, now?: () => number, othersRefreshMs?: number }} deps
 */
function createNativeSource({ native, exec, now = Date.now, othersRefreshMs = OTHERS_REFRESH_MS }) {
    /** @type {Map<number, string>} */
    const users = new Map();
    // pid → { key, command }: the executable path, looked up again only when the pid is reused.
    /** @type {Map<number, { key: string, command: string, name: string }>} */
    let identities = new Map();
    let others = new Map();
    let othersAt = -Infinity;
    let othersPending = null;

    /** @returns {string} */
    const userName = (uid) => {
        const known = users.get(uid);
        if (known !== undefined) return known;
        const name = native.userName(uid) ?? String(uid);
        users.set(uid, name);
        return name;
    };

    // Strings are decoded only here, on a cache miss (a new process or a reused pid); decoding two names
    // for every process every tick was the largest cost left in the native sampler.
    function identity(pid, key, next) {
        const known = identities.get(pid);
        const resolved = known && known.key === key ? known : (() => {
            const shortName = native.comm(pid) || String(pid);
            const command = native.path(pid) || shortName;
            return { key, command, name: path.basename(command) || shortName };
        })();
        next.set(pid, resolved);
        return resolved;
    }

    async function othersInfo() {
        if (now() - othersAt < othersRefreshMs) return others;
        othersPending ??= exec('ps', OTHERS_PS_ARGS)
            .then(({ stdout }) => {
                others = parseOthersPs(stdout, now());
                othersAt = now();
            }, (err) => {
                throw toolError(err, 'ps');
            })
            .finally(() => {
                othersPending = null;
            });
        await othersPending;
        return others;
    }

    /** @returns {ProcessInfo} */
    function ownProcess(pid, t, next) {
        const startedAt = t.startSec * 1000 + Math.floor(t.startUsec / 1000);
        const who = identity(pid, `${startedAt}`, next);
        return {
            pid, ppid: t.ppid, name: who.name, command: who.command, user: userName(t.uid), state: stateOf(t.status, t.running),
            rssKB: Math.round(t.rssBytes / 1024), cpuTicks: t.cpuNs, startedAt,
        };
    }

    /** @returns {ProcessInfo} */
    function otherProcess(pid, s, extra, next) {
        // No start time without root: ps's (every 5 s) tells a reused pid apart.
        const who = identity(pid, `${extra ? extra.startedAt : ''}`, next);
        return {
            pid, ppid: s.ppid, name: who.name, command: who.command, user: userName(s.uid),
            state: extra ? extra.state : stateOf(s.status, 0), rssKB: extra ? extra.rssKB : 0,
            cpuPercent: extra ? extra.cpuPercent : 0, startedAt: extra ? extra.startedAt : null,
        };
    }

    /** @returns {Promise<ProcessInfo[]>} */
    async function listProcesses() {
        const own = [];
        const denied = [];
        for (const pid of native.listPids()) {
            const t = native.taskInfo(pid);
            if (t) own.push([pid, t]);
            else {
                const s = native.shortInfo(pid);
                if (s) denied.push([pid, s]);
            }
        }
        const extra = denied.length ? await othersInfo() : others;
        const next = new Map();
        const procs = [
            ...own.map(([pid, t]) => ownProcess(pid, t, next)),
            ...denied.map(([pid, s]) => otherProcess(pid, s, extra.get(pid), next)),
        ];
        identities = next;
        return procs;
    }

    /** Activity Monitor's "Memory Used" and "Cached Files", from Mach page counts (as vm_stat reports). */
    function memory(totalMemBytes) {
        const vm = native.vmStats();
        const pages = {
            'anonymous pages': vm.internal,
            'pages purgeable': vm.purgeable,
            'pages wired down': vm.wire,
            'pages occupied by compressor': vm.compressor,
            'file-backed pages': vm.external,
        };
        const swap = native.swapUsage();
        return {
            totalMB: Math.round(totalMemBytes / BYTES_PER_MB),
            usedMB: memoryUsedMB({ pageSize: vm.pageSize, pages }),
            cachedMB: cachedMB({ pageSize: vm.pageSize, pages }),
            swapUsedMB: Math.round(swap.usedBytes / BYTES_PER_MB),
            swapTotalMB: Math.round(swap.totalBytes / BYTES_PER_MB),
        };
    }

    /**
     * Listening TCP sockets of the processes we can inspect (like unprivileged lsof: our own).
     * Names come from the last process sample.
     * @returns {{ items: PortInfo[], partial: boolean }}
     */
    function listeningPorts({ isRoot }) {
        const seen = new Set();
        /** @type {PortInfo[]} */
        const items = [];
        for (const pid of native.listPids()) {
            for (const { port, address } of native.listeningSockets(pid)) {
                const key = `${pid}|${address}|${port}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const name = identities.get(pid)?.name ?? native.comm(pid);
                items.push({ port, address, proto: 'tcp', pid, name });
            }
        }
        items.sort((a, b) => a.port - b.port || (a.pid ?? 0) - (b.pid ?? 0));
        return { items, partial: !isRoot };
    }

    return { clockTicks: NS_PER_SECOND, listProcesses, memory, listeningPorts };
}

module.exports = { createNativeSource, parseOthersPs, OTHERS_PS_ARGS, OTHERS_REFRESH_MS };
