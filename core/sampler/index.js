// The sampling loop: reads the platform on a fixed tick and pushes results into a sink (the store).
// Each data source has its own cadence, and a failing source never stops the others.
const os = require('node:os');
const { cpuBusy, processCpu } = require('./cpu');

/** @typedef {import('../platform/types').PlatformAdapter} PlatformAdapter */

/** @type {Readonly<{ intervalMs: number, portsSlowMs: number, portsFastMs: number, managedMemMs: number }>} */
const DEFAULTS = Object.freeze({
    intervalMs: 1000,
    portsSlowMs: 5000,
    portsFastMs: 1000, // while the Ports view is open
    managedMemMs: 5000,
});

/**
 * What the sampler needs from the store. Kept narrow so the sampler is testable with a fake.
 * @typedef {Object} SamplerSink
 * @property {(system: object) => void} setSystem
 * @property {(processes: import('./cpu').SampledProcess[]) => void} setProcesses
 * @property {(ports: import('../platform/types').PortsResult) => void} setPorts
 * @property {(source: string, err: Error) => void} reportError
 * @property {(source: string) => void} clearError
 * @property {(at: number) => void} sampleManagedMemory
 * @property {() => boolean} prefersFastPorts
 */

const realClock = { now: Date.now, setInterval, clearInterval };

/**
 * @param {{ platform: PlatformAdapter, sink: SamplerSink, clock?: any, uptime?: () => number } &
 *          Partial<typeof DEFAULTS>} options
 */
function createSampler({ platform, sink, clock = realClock, uptime = os.uptime, ...cadence }) {
    // Drop undefined values first: `{ intervalMs: undefined }` must NOT override the default
    // (it once turned into setInterval(fn, undefined), i.e. sampling ps every millisecond).
    const given = Object.fromEntries(Object.entries(cadence).filter(([, v]) => v !== undefined));
    const cfg = { ...DEFAULTS, ...given };
    let prevCores = null;
    let prevTicks = new Map();
    let lastTickAt = null;
    let lastPortsAt = -Infinity;
    let lastManagedMemAt = -Infinity;
    let inFlight = false;
    let timer = null;

    // Runs one source; reports failures under `source` and clears them once it succeeds again.
    async function guarded(source, fn) {
        try {
            const result = await fn();
            sink.clearError(source);
            return result;
        } catch (err) {
            sink.reportError(source, err);
            return undefined;
        }
    }

    async function sampleSystemAndProcesses(now) {
        const cores = platform.cpuTimes();
        const busy = cpuBusy(prevCores, cores);
        prevCores = cores;
        const elapsedMs = lastTickAt === null ? 0 : now - lastTickAt;
        lastTickAt = now;

        const [memory, procs] = await Promise.all([
            guarded('memory', () => platform.memory()),
            guarded('processes', () => platform.listProcesses()),
        ]);
        sink.setSystem({
            cpuPercent: busy ? busy.total : null,
            cores: busy ? busy.cores : [],
            load: platform.loadAverage(),
            memUsedMB: memory ? memory.usedMB : null,
            memTotalMB: memory ? memory.totalMB : null,
            memCachedMB: memory ? memory.cachedMB ?? null : null,
            swapUsedMB: memory ? memory.swapUsedMB : null,
            swapTotalMB: memory ? memory.swapTotalMB ?? null : null,
            uptimeSec: Math.floor(uptime()),
        });
        if (procs) {
            const result = processCpu({ procs, prevTicks, elapsedMs, clockTicks: platform.clockTicks ?? 100 });
            prevTicks = result.ticks;
            sink.setProcesses(result.processes);
        }
    }

    async function samplePortsIfDue(now) {
        const every = sink.prefersFastPorts() ? cfg.portsFastMs : cfg.portsSlowMs;
        if (now - lastPortsAt < every) return;
        lastPortsAt = now;
        const ports = await guarded('ports', () => platform.listeningPorts());
        if (ports) sink.setPorts(ports);
    }

    async function tick() {
        if (inFlight) return;
        inFlight = true;
        try {
            const now = clock.now();
            await Promise.all([sampleSystemAndProcesses(now), samplePortsIfDue(now)]);
            if (now - lastManagedMemAt >= cfg.managedMemMs) {
                lastManagedMemAt = now;
                sink.sampleManagedMemory(now);
            }
        } finally {
            inFlight = false;
        }
    }

    return {
        tick,
        start() {
            if (timer) return;
            tick();
            timer = clock.setInterval(tick, cfg.intervalMs);
        },
        stop() {
            if (timer) clock.clearInterval(timer);
            timer = null;
        },
        /** Fetch ports on the next tick (e.g. when the Ports view opens). */
        requestPorts() {
            lastPortsAt = -Infinity;
        },
    };
}

module.exports = { createSampler, SAMPLER_DEFAULTS: DEFAULTS };
