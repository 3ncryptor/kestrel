// Pure parsers and small I/O helpers for the Linux adapter (see linux.js).
const { execFileSync } = require('node:child_process');
const nodeFs = require('node:fs');
const { PlatformError } = require('./errors');
const { parseAddress, formatIpv6 } = require('./net');

/** @typedef {import('./types').ProcessInfo} ProcessInfo */
/** @typedef {import('./types').PortInfo} PortInfo */
/** @typedef {import('./types').ExecFn} ExecFn */

const KB_PER_MB = 1024;
const TCP_LISTEN = '0A';
const READ_CONCURRENCY = 64;
// Missing entries are expected: processes exit while we scan.
const VANISHED = new Set(['ENOENT', 'ESRCH']);

const STATE_LABELS = {
    R: 'running', S: 'sleeping', D: 'waiting', I: 'idle', T: 'stopped', t: 'stopped', Z: 'zombie', X: 'dead',
};

// ---------- pure parsers ----------

/** `/proc/[pid]/stat` → selected fields. Splits at the LAST ")" because comm may contain ")" or spaces. */
function parseProcStat(text) {
    const open = text.indexOf('(');
    const close = text.lastIndexOf(')');
    if (open === -1 || close < open) return null;
    const rest = text.slice(close + 2).trim().split(/\s+/);
    if (rest.length < 22) return null;
    // Indexes into `rest` = proc(5) field number − 3.
    return {
        pid: Number(text.slice(0, open)),
        comm: text.slice(open + 1, close),
        state: STATE_LABELS[rest[0]] || 'unknown',
        ppid: Number(rest[1]),
        cpuTicks: Number(rest[11]) + Number(rest[12]),
        starttime: Number(rest[19]),
        rssPages: Number(rest[21]),
    };
}

/**
 * Per-core times from `/proc/stat` (`cpu0 …` lines; the aggregate `cpu` line is skipped). iowait counts
 * as idle; softirq and steal (time the hypervisor gave to others, visible on EC2) as busy.
 * @returns {import('./types').CpuTimes[]}
 */
function parseProcStatCpus(text) {
    const cores = [];
    for (const line of text.split('\n')) {
        if (!/^cpu\d+ /.test(line)) continue;
        const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = line.split(/\s+/).slice(1).map(Number);
        cores.push({ user, nice, sys: system, idle: idle + iowait, irq: irq + softirq + steal });
    }
    return cores;
}

function parseStatusUid(text) {
    const match = /^Uid:\s+(\d+)/m.exec(text);
    return match ? Number(match[1]) : null;
}

function parseCmdline(text) {
    return text.split('\0').filter(Boolean).join(' ');
}

function parseMeminfo(text) {
    /** @type {Record<string, number>} */
    const kb = {};
    for (const match of text.matchAll(/^(\w+):\s+(\d+)/gm)) kb[match[1]] = Number(match[2]);
    const available = kb.MemAvailable ?? (kb.MemFree || 0) + (kb.Buffers || 0) + (kb.Cached || 0);
    const toMB = (value) => Math.round(value / KB_PER_MB);
    return {
        totalMB: toMB(kb.MemTotal || 0),
        usedMB: toMB((kb.MemTotal || 0) - available),
        cachedMB: toMB((kb.Cached || 0) + (kb.Buffers || 0) + (kb.SReclaimable || 0)),
        swapUsedMB: toMB((kb.SwapTotal || 0) - (kb.SwapFree || 0)),
        swapTotalMB: toMB(kb.SwapTotal || 0),
    };
}

/** @returns {Map<number, string>} uid → user name */
function parsePasswd(text) {
    const users = new Map();
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const [name, , uid] = line.split(':');
        if (name && /^\d+$/.test(uid || '')) users.set(Number(uid), name);
    }
    return users;
}

function parseBootTime(text) {
    const match = /^btime\s+(\d+)/m.exec(text);
    return match ? Number(match[1]) : null;
}

/** `ss -ltnpH` → PortInfo[] (owner only when visible to us). */
function parseSs(text) {
    /** @type {PortInfo[]} */
    const items = [];
    for (const line of text.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols[0] !== 'LISTEN' || cols.length < 4) continue;
        const addr = parseAddress(cols[3]);
        if (!addr) continue;
        const owner = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
        items.push({
            port: addr.port,
            address: addr.address,
            proto: 'tcp',
            pid: owner ? Number(owner[2]) : null,
            name: owner ? owner[1] : null,
        });
    }
    return items.sort((a, b) => a.port - b.port);
}

/** Kernel hex: IPv4 is one little-endian word; IPv6 is four little-endian 32-bit words. */
function decodeHexAddress(hex, isV6) {
    const words = hex.match(/.{8}/g) || [];
    const bytes = words.flatMap((w) => (w.match(/../g) || []).reverse().map((b) => parseInt(b, 16)));
    if (!isV6) return bytes.join('.');
    const groups = [];
    for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);
    return formatIpv6(groups);
}

/** `/proc/net/tcp{,6}` → listening sockets with their inode. */
function parseProcNetTcp(text, isV6) {
    return text
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((cols) => cols.length > 9 && cols[3] === TCP_LISTEN)
        .map((cols) => {
            const [hexAddr, hexPort] = cols[1].split(':');
            return { address: decodeHexAddress(hexAddr, isV6), port: parseInt(hexPort, 16), inode: Number(cols[9]) };
        });
}

/** Reads a numeric sysconf value once via getconf, falling back when unavailable. */
function readSysconf(name, fallback, run = (file, args) => execFileSync(file, args, { encoding: 'utf-8' })) {
    try {
        const value = parseInt(String(run('getconf', [name])).trim(), 10);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
        return fallback;
    }
}

// ---------- I/O helpers ----------

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

async function readOptional(fs, file) {
    try {
        return await fs.readFile(file, 'utf-8');
    } catch (err) {
        if (VANISHED.has(err.code) || err.code === 'EACCES') return null;
        throw new PlatformError(`Cannot read ${file}: ${err.message}`, 'EREAD');
    }
}

// One reused buffer for the per-tick /proc reads. Synchronous on purpose: an async readFile is three
// thread-pool round trips (open, read, close), and 600 processes × 3 files cost 170 ms of CPU per tick in
// M3. One open/read/close into this buffer costs about 2.5 µs (measured in a Debian container).
const PROC_TEXT_MAX = 64 * 1024;
const scratch = Buffer.allocUnsafe(PROC_TEXT_MAX);

/** A small /proc file as text (up to `maxBytes`), or null when the process vanished or it is not ours. */
function readProcText(file, maxBytes = PROC_TEXT_MAX) {
    let fd;
    try {
        fd = nodeFs.openSync(file, 'r');
    } catch (err) {
        if (VANISHED.has(err.code) || err.code === 'EACCES') return null;
        throw new PlatformError(`Cannot read ${file}: ${err.message}`, 'EREAD');
    }
    try {
        const limit = Math.min(maxBytes, PROC_TEXT_MAX);
        let length = 0;
        while (length < limit) {
            const n = nodeFs.readSync(fd, scratch, length, limit - length, length);
            if (n === 0) break;
            length += n;
        }
        return scratch.toString('utf-8', 0, length);
    } catch (err) {
        if (VANISHED.has(err.code) || err.code === 'EACCES') return null;
        throw new PlatformError(`Cannot read ${file}: ${err.message}`, 'EREAD');
    } finally {
        nodeFs.closeSync(fd);
    }
}

async function listPids(fs, procRoot) {
    const entries = await fs.readdir(procRoot);
    return entries.filter((e) => /^\d+$/.test(e)).map(Number).sort((a, b) => a - b);
}

module.exports = {
    parseProcStat,
    parseProcStatCpus,
    parseStatusUid,
    parseCmdline,
    parseMeminfo,
    parsePasswd,
    parseBootTime,
    parseSs,
    parseProcNetTcp,
    decodeHexAddress,
    formatIpv6,
    readSysconf,
    mapLimit,
    readOptional,
    listPids,
    READ_CONCURRENCY,
    readProcText,
};
