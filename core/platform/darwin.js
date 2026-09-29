// macOS platform adapter: ps, vm_stat, sysctl and lsof, always via execFile (no shell).
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const util = require('util');
const { toolError } = require('./errors');
const { parseAddress } = require('./net');

/** @typedef {import('./types').ProcessInfo} ProcessInfo */
/** @typedef {import('./types').PortInfo} PortInfo */
/** @typedef {import('./types').ExecFn} ExecFn */

const MAX_BUFFER = 16 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;
// `comm` must stay last so executable paths containing spaces are never split.
const PS_ARGS = ['-A', '-o', 'pid=,ppid=,pcpu=,rss=,state=,user=,etime=,comm='];
const LSOF_ARGS = ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'];
const SWAP_TTL_MS = 5000;

// First letter of the BSD `state` column.
const STATE_LABELS = { R: 'running', S: 'sleeping', I: 'idle', T: 'stopped', U: 'waiting', Z: 'zombie' };

// ---------- pure parsers ----------

/** `[[dd-]hh:]mm:ss` → seconds, or null. */
function parseEtime(text) {
    const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(text).trim());
    if (!match) return null;
    const [, days = '0', hours = '0', minutes, seconds] = match;
    return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * @param {string} line  one headerless row produced by PS_ARGS
 * @param {number} now   epoch ms, used to turn elapsed time into a start time
 * @returns {ProcessInfo|null}
 */
function parsePsLine(line, now) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match) return null;
    const [, pid, ppid, pcpu, rss, state, user, etime, comm] = match;
    const elapsed = parseEtime(etime);
    return {
        pid: Number(pid),
        ppid: Number(ppid),
        name: path.basename(comm),
        command: comm,
        user,
        state: /** @type {any} */ (STATE_LABELS[state[0]] || 'unknown'),
        rssKB: Number(rss),
        cpuPercent: Number(pcpu),
        startedAt: elapsed === null ? null : now - elapsed * 1000,
    };
}

/** @returns {ProcessInfo[]} */
function parsePsOutput(text, now) {
    return text
        .split('\n')
        .map((line) => parsePsLine(line, now))
        .filter((p) => p !== null);
}

/** `vm_stat` → { pageSize, pages: { 'pages active': n, … } } with lower-cased keys. */
function parseVmStat(text) {
    const pageMatch = /page size of (\d+) bytes/.exec(text);
    /** @type {Record<string, number>} */
    const pages = {};
    for (const line of text.split('\n')) {
        const match = /^"?([^":]+)"?:\s+(\d+)\.?$/.exec(line.trim());
        if (match) pages[match[1].trim().toLowerCase()] = Number(match[2]);
    }
    return { pageSize: pageMatch ? Number(pageMatch[1]) : 4096, pages };
}

/**
 * "Memory Used" as Activity Monitor defines it: app memory (anonymous − purgeable) + wired +
 * compressed. File cache is excluded because macOS hands it back on demand.
 */
function memoryUsedMB({ pageSize, pages }) {
    const count = (key) => pages[key] || 0;
    const appPages = 'anonymous pages' in pages
        ? count('anonymous pages') - count('pages purgeable')
        : count('pages active');
    const usedPages = appPages + count('pages wired down') + count('pages occupied by compressor');
    return Math.round((usedPages * pageSize) / BYTES_PER_MB);
}

/** File cache (macOS "Cached Files"): file-backed pages. */
function cachedMB({ pageSize, pages }) {
    return Math.round(((pages['file-backed pages'] || 0) * pageSize) / BYTES_PER_MB);
}

/** `vm.swapusage: total = 6144.00M …` → total MB */
function parseSwapTotal(text) {
    const match = /total = ([\d.]+)([MG])/.exec(text);
    return match ? Math.round(Number(match[1]) * (match[2] === 'G' ? 1024 : 1)) : 0;
}

/** `hw.memsize: 8589934592` → MB */
function parseMemsize(text) {
    const match = /hw\.memsize:\s*(\d+)/.exec(text);
    return match ? Math.round(Number(match[1]) / BYTES_PER_MB) : 0;
}

/** `vm.swapusage: total = 6144.00M  used = 4862.88M …` → used MB */
function parseSwapUsage(text) {
    const match = /used = ([\d.]+)([MG])/.exec(text);
    if (!match) return 0;
    const value = Number(match[1]) * (match[2] === 'G' ? 1024 : 1);
    return Math.round(value);
}

/**
 * `lsof -F pcn` output: `p<pid>` starts a process, `c<command>` names it, `n<addr>` is a socket.
 * The same socket appears once per file descriptor, so results are de-duplicated.
 * @returns {PortInfo[]}
 */
function parseLsof(text) {
    const seen = new Set();
    /** @type {PortInfo[]} */
    const items = [];
    let pid = null;
    let name = null;
    for (const line of text.split('\n')) {
        const field = line[0];
        const value = line.slice(1);
        if (field === 'p') [pid, name] = [Number(value), null];
        else if (field === 'c') name = value;
        else if (field === 'n') {
            const addr = parseAddress(value);
            const key = `${pid}|${value}`;
            if (!addr || seen.has(key)) continue;
            seen.add(key);
            items.push({ port: addr.port, address: addr.address, proto: 'tcp', pid, name });
        }
    }
    return items.sort((a, b) => a.port - b.port || (a.pid ?? 0) - (b.pid ?? 0));
}

// ---------- adapter ----------

const defaultExec = /** @type {ExecFn} */ (
    (file, args) => util.promisify(execFile)(file, args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER })
);

async function run(exec, tool, args) {
    try {
        return (await exec(tool, args)).stdout;
    } catch (err) {
        throw toolError(err, tool);
    }
}

/**
 * @param {{ exec?: ExecFn, now?: () => number, isRoot?: boolean, totalMemBytes?: number }} [deps]
 * @returns {import('./types').PlatformAdapter}
 */
function createDarwinAdapter({
    exec = defaultExec,
    now = Date.now,
    isRoot = process.getuid?.() === 0,
    totalMemBytes = os.totalmem(), // constant: no need to spawn sysctl for it every tick
} = {}) {
    let swap = { usedMB: 0, totalMB: 0 };
    let swapAt = -Infinity;

    // Swap changes slowly; spawning sysctl once per SWAP_TTL_MS keeps Kestrel's own CPU low.
    async function currentSwap() {
        if (now() - swapAt < SWAP_TTL_MS) return swap;
        const text = await run(exec, 'sysctl', ['vm.swapusage']);
        swap = { usedMB: parseSwapUsage(text), totalMB: parseSwapTotal(text) };
        swapAt = now();
        return swap;
    }

    return {
        id: 'darwin',
        async listProcesses() {
            return parsePsOutput(await run(exec, 'ps', PS_ARGS), now());
        },
        async memory() {
            const [vmText, swapNow] = await Promise.all([run(exec, 'vm_stat', []), currentSwap()]);
            const vm = parseVmStat(vmText);
            return {
                totalMB: Math.round(totalMemBytes / BYTES_PER_MB),
                usedMB: memoryUsedMB(vm),
                cachedMB: cachedMB(vm),
                swapUsedMB: swapNow.usedMB,
                swapTotalMB: swapNow.totalMB,
            };
        },
        async listeningPorts() {
            let text;
            try {
                text = (await exec('lsof', LSOF_ARGS)).stdout;
            } catch (err) {
                // lsof exits 1 when nothing matched; that is an empty result, not a failure.
                if (err && err.code === 1 && !err.stdout) text = '';
                else throw toolError(err, 'lsof');
            }
            return { items: parseLsof(text), partial: !isRoot };
        },
        cpuTimes: () => os.cpus().map((cpu) => ({ ...cpu.times })),
        loadAverage: () => os.loadavg(),
    };
}

module.exports = {
    createDarwinAdapter,
    parseEtime,
    parsePsLine,
    parsePsOutput,
    parseVmStat,
    memoryUsedMB,
    cachedMB,
    parseMemsize,
    parseSwapUsage,
    parseSwapTotal,
    parseAddress,
    parseLsof,
};
