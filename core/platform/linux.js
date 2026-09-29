// Linux platform adapter. Reads /proc directly: `ps %cpu` on Linux is a lifetime average, so
// processes report cumulative cpuTicks and the sampler turns tick deltas into a current CPU%.
const { execFile } = require('child_process');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const util = require('util');
const { toolError } = require('./errors');
const parsers = require('./linuxParsers');

/** @typedef {import('./types').ProcessInfo} ProcessInfo */
/** @typedef {import('./types').PortInfo} PortInfo */
/** @typedef {import('./types').ExecFn} ExecFn */

const SOCKET_LINK = /^socket:\[(\d+)\]$/;

const defaultExec = /** @type {ExecFn} */ (
    (file, args) => util.promisify(execFile)(file, args, { encoding: 'utf-8' })
);

/**
 * @param {{ procRoot?: string, etcRoot?: string, fs?: any, exec?: ExecFn, isRoot?: boolean,
 *           clockTicks?: number, pageSize?: number }} [deps]
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
} = {}) {
    const proc = (...parts) => path.join(procRoot, ...parts);
    let usersPromise = null;
    let bootTimePromise = null;

    const users = () => (usersPromise ??= parsers
        .readOptional(fs, path.join(etcRoot, 'passwd'))
        .then((text) => parsers.parsePasswd(text || '')));
    const bootTime = () => (bootTimePromise ??= parsers
        .readOptional(fs, proc('stat'))
        .then((text) => parsers.parseBootTime(text || '')));

    /** @returns {Promise<ProcessInfo|null>} */
    async function readProcess(pid, userMap, btime) {
        const [statText, statusText, cmdlineText] = await Promise.all(
            ['stat', 'status', 'cmdline'].map((f) => parsers.readOptional(fs, proc(String(pid), f)))
        );
        const stat = statText && parsers.parseProcStat(statText);
        if (!stat) return null; // vanished between readdir and read
        const uid = parsers.parseStatusUid(statusText || '');
        const command = parsers.parseCmdline(cmdlineText || '');
        return {
            pid: stat.pid,
            ppid: stat.ppid,
            name: stat.comm,
            command: command || `[${stat.comm}]`,
            user: uid === null ? '?' : userMap.get(uid) ?? String(uid),
            state: /** @type {any} */ (stat.state),
            rssKB: Math.round((stat.rssPages * pageSize) / 1024),
            cpuTicks: stat.cpuTicks,
            startedAt: btime === null ? null : (btime + stat.starttime / clockTicks) * 1000,
        };
    }

    async function listProcesses() {
        const [pids, userMap, btime] = await Promise.all([parsers.listPids(fs, procRoot), users(), bootTime()]);
        const procs = await parsers.mapLimit(pids, parsers.READ_CONCURRENCY, (pid) => readProcess(pid, userMap, btime));
        return procs.filter((p) => p !== null);
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
        const owners = await socketOwners(new Set(sockets.map((s) => s.inode)));
        /** @type {PortInfo[]} */
        const items = await Promise.all(sockets.map(async ({ address, port, inode }) => {
            const pid = owners.get(inode) ?? null;
            const stat = pid === null ? null : await parsers.readOptional(fs, proc(String(pid), 'stat'));
            const name = stat ? parsers.parseProcStat(stat)?.comm ?? null : null;
            return { port, address, proto: /** @type {'tcp'} */ ('tcp'), pid, name };
        }));
        return items.sort((a, b) => a.port - b.port);
    }

    async function listeningPorts() {
        try {
            const { stdout } = await exec('ss', ['-ltnpH']);
            return { items: parsers.parseSs(stdout), partial: !isRoot };
        } catch (err) {
            const error = toolError(err, 'ss');
            if (error.code !== 'ENOTOOL') throw error;
            return { items: await portsFromProcNet(), partial: !isRoot };
        }
    }

    return {
        id: 'linux',
        clockTicks,
        listProcesses,
        memory,
        listeningPorts,
        cpuTimes: () => os.cpus().map((cpu) => ({ ...cpu.times })),
        loadAverage: () => os.loadavg(),
    };
}

module.exports = { createLinuxAdapter, ...parsers };
