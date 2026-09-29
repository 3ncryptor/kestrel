// `kestrel sm`: the interactive Monitor, or `--dump` for headless JSON snapshots.
const { createKestrel } = require('../../core');
const { monitor } = require('./interactive');

const DEFAULT_INTERVAL_MS = 1000;
const TOP_PROCESSES = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One compact, JSON-safe snapshot of the store. */
function snapshot(state, tick) {
    return {
        tick,
        at: Date.now(),
        meta: state.meta,
        system: state.system,
        history: state.history,
        processCount: state.processes.length,
        topProcesses: state.processes.slice(0, TOP_PROCESSES),
        ports: state.ports,
        errors: state.errors,
    };
}

async function dump({ ticks, intervalMs }, io) {
    const kestrel = createKestrel({ intervalMs });
    try {
        for (let tick = 1; tick <= ticks; tick++) {
            await kestrel.tick();
            io.stdout.write(`${JSON.stringify(snapshot(kestrel.store.getState(), tick))}\n`);
            if (tick < ticks) await sleep(intervalMs);
        }
    } finally {
        await kestrel.stop();
    }
    return 0;
}

/** @param {{ options: any }} parsed @param {{ stdout: any, stderr: any }} io */
async function sm(parsed, io) {
    const { dump: isDump, ticks } = parsed.options;
    const intervalMs = parsed.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    if (isDump) return dump({ ticks, intervalMs }, io);
    return monitor(parsed, io);
}

module.exports = { sm, snapshot };
