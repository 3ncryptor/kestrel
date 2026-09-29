// Linux platform adapter. Reads /proc directly: `ps %cpu` on Linux is a lifetime average, so
// processes report cumulative cpuTicks and the sampler turns tick deltas into a current CPU%.
const { execFile } = require('node:child_process');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');
const { toolError } = require('./errors');
const parsers = require('./linuxParsers');

/** @typedef {import('./types').ProcessInfo} ProcessInfo */
/** @typedef {import('./types').PortInfo} PortInfo */
/** @typedef {import('./types').ExecFn} ExecFn */

const SOCKET_LINK = /^socket:\[(\d+)\]$/;

const defaultExec = /** @type {ExecFn} */ (
    (file, args) => util.promisify(execFile)(file, args, { encoding: 'utf-8' })
);

// /proc/<pid>/status only needs to reach the Uid line (the 9th); cmdline is shown truncated anyway.
const STATUS_MAX_BYTES = 4096;
const CMDLINE_MAX_BYTES = 8192;

/**
 * @param {{ procRoot?: string, etcRoot?: string, fs?: any, exec?: ExecFn, isRoot?: boolean,
 *           clockTicks?: number, pageSize?: number,
 *           readText?: (file: string, maxBytes?: number) => string|null }} [deps]
 * @returns {import('./types').PlatformAdapter}
 */
function createLinuxAdapter({
    procRoot = '/proc',
    etcRoot = '/etc',
    fs = fsPromises,
    exec = defaultExec,
    isRoot = process.getuid?.() === 0,
    clockTicks = parsers.readSysconf('CLK_TCK', 100),
    pageSize = parsers.readSysconf('PAGESIZE', 4096),
    readText = parsers.readProcText,
} = {}) {
    const proc = (...parts) => path.join(procRoot, ...parts);
    let usersPromise = null;
    let bootTimePromise = null;
    // pid → { starttime, command, uid }: what does not change while a process lives. Keyed by start
    // time too, so a reused pid is read again. Entries of exited processes are dropped every tick.
    /** @type {Map<number, { starttime: number, command: string, uid: number|null }>} */
    let identities = new Map();
    // Without `ss` (minimal images), ports come from /proc/net/tcp plus an owner scan of every process's
    // fds. Probe for ss once, and keep inode → owner so the scan only runs when a listener is new.
    let ssMissing = false;
    /** @type {Map<number, number>} */
    let socketOwnerCache = new Map();

    const users = () => (usersPromise ??= parsers
        .readOptional(fs, path.join(etcRoot, 'passwd'))
        .then((text) => parsers.parsePasswd(text || '')));
    const bootTime = () => (bootTimePromise ??= parsers
        .readOptional(fs, proc('stat'))
        .then((text) => parsers.parseBootTime(text || '')));

    function identityOf(pid, stat) {
        const known = identities.get(pid);
        if (known && known.starttime === stat.starttime) return known;
        const uid = parsers.parseStatusUid(readText(proc(String(pid), 'status'), STATUS_MAX_BYTES) || '');
        const command = parsers.parseCmdline(readText(proc(String(pid), 'cmdline'), CMDLINE_MAX_BYTES) || '');
        return { starttime: stat.starttime, command: command || `[${stat.comm}]`, uid };
    }

    /** @returns {ProcessInfo|null} */
    function readProcess(pid, userMap, btime, seen) {
        const statText = readText(proc(String(pid), 'stat'));
        const stat = statText && parsers.parseProcStat(statText);
        if (!stat) return null; // vanished between readdir and read
        const identity = identityOf(pid, stat);
        seen.set(pid, identity);
        return {
            pid: stat.pid,
            ppid: stat.ppid,
            name: stat.comm,
            command: identity.command,
            user: identity.uid === null ? '?' : userMap.get(identity.uid) ?? String(identity.uid),
            state: /** @type {any} */ (stat.state),
            rssKB: Math.round((stat.rssPages * pageSize) / 1024),
            cpuTicks: stat.cpuTicks,
            startedAt: btime === null ? null : (btime + stat.starttime / clockTicks) * 1000,
        };
    }

    async function listProcesses() {
        const [pids, userMap, btime] = await Promise.all([parsers.listPids(fs, procRoot), users(), bootTime()]);
        const seen = new Map();
        const procs = pids.map((pid) => readProcess(pid, userMap, btime, seen)).filter((p) => p !== null);
        identities = seen;
        return procs;
    }

    async function memory() {
        return parsers.parseMeminfo((await parsers.readOptional(fs, proc('meminfo'))) || '');
    }

    /** inode → pid, by scanning /proc/[pid]/fd (only our own processes unless root). */
    async function socketOwners(inodes) {
        const owners = new Map();
        const pids = await parsers.listPids(fs, procRoot);
        await parsers.mapLimit(pids, parsers.READ_CONCURRENCY, async (pid) => {
            let fds = [];
            try {
                fds = await fs.readdir(proc(String(pid), 'fd'));
            } catch {
                return; // permission denied or process gone
            }
            for (const fd of fds) {
                const link = await fs.readlink(proc(String(pid), 'fd', fd)).catch(() => '');
                const match = SOCKET_LINK.exec(link);
                if (match && inodes.has(Number(match[1]))) owners.set(Number(match[1]), pid);
            }
        });
        return owners;
    }

    async function portsFromProcNet() {
        const [v4, v6] = await Promise.all(['tcp', 'tcp6'].map((f) => parsers.readOptional(fs, proc('net', f))));
        const sockets = [...parsers.parseProcNetTcp(v4 || '', false), ...parsers.parseProcNetTcp(v6 || '', true)];
        const names = new Map(); // pid → comm, and proof that the cached owner is still alive
        const nameOf = (pid) => {
            if (!names.has(pid)) names.set(pid, parsers.parseProcStat(readText(proc(String(pid), 'stat')) || '')?.comm ?? null);
            return names.get(pid);
        };
        const cachedValid = sockets.every(({ inode }) => socketOwnerCache.has(inode) && nameOf(socketOwnerCache.get(inode)) !== null);
        if (!cachedValid) socketOwnerCache = await socketOwners(new Set(sockets.map((s) => s.inode)));
        /** @type {PortInfo[]} */
        const items = sockets.map(({ address, port, inode }) => {
            const pid = socketOwnerCache.get(inode) ?? null;
            return { port, address, proto: /** @type {'tcp'} */ ('tcp'), pid, name: pid === null ? null : nameOf(pid) };
        });
        return items.sort((a, b) => a.port - b.port);
    }

    async function listeningPorts() {
        if (!ssMissing) {
            try {
                const { stdout } = await exec('ss', ['-ltnpH']);
                return { items: parsers.parseSs(stdout), partial: !isRoot };
            } catch (err) {
                const error = toolError(err, 'ss');
                if (error.code !== 'ENOTOOL') throw error;
                ssMissing = true;
            }
        }
        return { items: await portsFromProcNet(), partial: !isRoot };
    }

    /** Per-core times from /proc/stat; os.cpus() would also parse cpuinfo and cpufreq files every call. */
    function cpuTimes() {
        const cores = parsers.parseProcStatCpus(readText(proc('stat')) || '');
        return cores.length ? cores : os.cpus().map((cpu) => ({ ...cpu.times }));
    }

    return {
        id: 'linux',
        clockTicks,
        listProcesses,
        memory,
        listeningPorts,
        cpuTimes,
        loadAverage: () => os.loadavg(),
    };
}

module.exports = { createLinuxAdapter, ...parsers };
