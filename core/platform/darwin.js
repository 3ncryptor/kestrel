// macOS platform adapter: ps, vm_stat, sysctl and lsof, always via execFile (no shell).
const { execFile } = require('node:child_process');
const os = require('node:os');
const util = require('node:util');
const { toolError } = require('./errors');
const parsers = require('./darwinParsers');
const { createNativeSource } = require('./darwinNative');
const { loadDarwinNative } = require('./darwinFfi');
const {
    PS_ARGS, LSOF_ARGS, BYTES_PER_MB, parsePsOutput, parseVmStat, memoryUsedMB, cachedMB, parseSwapUsage, parseSwapTotal, parseLsof,
} = parsers;

/** @typedef {import('./types').ExecFn} ExecFn */

const MAX_BUFFER = 16 * 1024 * 1024;
const SWAP_TTL_MS = 5000;

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

/** libproc via Bun's FFI, unless disabled with KESTREL_NATIVE=0 (then ps/lsof, as under Node). */
const defaultNative = () => (process.env.KESTREL_NATIVE === '0' ? null : loadDarwinNative());

/**
 * @param {{ exec?: ExecFn, now?: () => number, isRoot?: boolean, totalMemBytes?: number, native?: any }} [deps]
 * @returns {import('./types').PlatformAdapter}
 */
function createDarwinAdapter({
    exec = defaultExec,
    now = Date.now,
    isRoot = process.getuid?.() === 0,
    totalMemBytes = os.totalmem(), // constant: no need to spawn sysctl for it every tick
    native = defaultNative(),
} = {}) {
    if (native) return nativeAdapter({ native, exec, now, isRoot, totalMemBytes });
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
        sampling: 'ps',
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

/**
 * The same adapter backed by libproc and Mach calls (darwinNative.js): no process spawned per tick.
 * @returns {import('./types').PlatformAdapter}
 */
function nativeAdapter({ native, exec, now, isRoot, totalMemBytes }) {
    const source = createNativeSource({ native, exec, now });
    return {
        id: 'darwin',
        sampling: 'native',
        clockTicks: source.clockTicks,
        listProcesses: () => source.listProcesses(),
        memory: async () => source.memory(totalMemBytes),
        listeningPorts: async () => source.listeningPorts({ isRoot }),
        cpuTimes: () => os.cpus().map((cpu) => ({ ...cpu.times })),
        loadAverage: () => os.loadavg(),
    };
}

module.exports = { createDarwinAdapter, ...parsers };
