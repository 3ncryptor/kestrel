// Pure CPU math. Machine CPU comes from os.cpus() deltas on both OSes; per-process CPU comes
// from ps on macOS or from /proc tick deltas on Linux.

/** @typedef {import('../platform/types').CpuTimes} CpuTimes */
/** @typedef {import('../platform/types').ProcessInfo} ProcessInfo */

/**
 * A process as published to the store: OS-neutral and ready to display.
 * @typedef {Object} SampledProcess
 * @property {number} pid
 * @property {number} ppid
 * @property {string} name
 * @property {string} command
 * @property {string} user
 * @property {string} state
 * @property {number} cpu      % of one core
 * @property {number} memMB
 * @property {number|null} startedAt
 */

const round1 = (n) => Math.round(n * 10) / 10;
const sumTimes = (t) => t.user + t.nice + t.sys + t.idle + t.irq;

/**
 * @param {CpuTimes[]|null} prev
 * @param {CpuTimes[]} curr
 * @returns {{ total: number, cores: number[] } | null}  null when there is no comparable baseline
 */
function cpuBusy(prev, curr) {
    if (!prev || prev.length !== curr.length) return null;
    let allTotal = 0;
    let allIdle = 0;
    const cores = curr.map((times, i) => {
        const dTotal = sumTimes(times) - sumTimes(prev[i]);
        const dIdle = times.idle - prev[i].idle;
        allTotal += dTotal;
        allIdle += dIdle;
        return dTotal > 0 ? round1((1 - dIdle / dTotal) * 100) : 0;
    });
    const total = allTotal > 0 ? round1((1 - allIdle / allTotal) * 100) : 0;
    return { total, cores };
}

/**
 * @param {{ procs: ProcessInfo[], prevTicks: Map<number, { ticks: number, startedAt: number|null }>,
 *           elapsedMs: number, clockTicks: number }} input
 * @returns {{ processes: SampledProcess[], ticks: Map<number, { ticks: number, startedAt: number|null }> }}
 */
function processCpu({ procs, prevTicks, elapsedMs, clockTicks }) {
    const ticks = new Map();
    const processes = procs.map((p) => {
        const { cpuPercent, cpuTicks, rssKB, ...rest } = p;
        let cpu = cpuPercent ?? 0;
        if (cpuTicks !== undefined) {
            ticks.set(p.pid, { ticks: cpuTicks, startedAt: p.startedAt });
            const prev = prevTicks.get(p.pid);
            // A different startedAt means the pid was reused by a new process: no valid baseline.
            const comparable = prev && prev.startedAt === p.startedAt && elapsedMs > 0;
            cpu = comparable ? Math.max(0, ((cpuTicks - prev.ticks) / clockTicks / (elapsedMs / 1000)) * 100) : 0;
        }
        return { ...rest, cpu: round1(cpu), memMB: round1(rssKB / 1024) };
    });
    return { processes, ticks };
}

module.exports = { cpuBusy, processCpu, round1 };
