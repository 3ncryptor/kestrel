// UI render cost (BUILD_PLAN §11.3): the real App in OpenTUI's test renderer, fed realistic ticks.
// Everything is laid out and drawn into the frame buffer; only the terminal write is skipped. Reports
// CPU per frame, so changes to the UI can be compared quickly and repeatably.
//
//   NODE_ENV=production bun scripts/bench-ui.jsx [frames=300] [--managed]
// OpenTUI's test renderer directly: @opentui/react/test-utils needs React's development build (act).
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { Store } from '../core/store/index.js';
import { createActions } from '../core/actions/index.js';
import { App } from '../ui/App.jsx';
import { ThemeContext } from '../ui/theme/context.js';
import { resolveTheme } from '../ui/theme/capabilities.js';

const FRAMES = Number(process.argv.find((a) => /^\d+$/.test(a)) || 300);
const PROCESSES = 570;
const CORES = 8;

// A deterministic process table that changes a little every tick, like a real machine.
let seed = 7;
const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
};
const names = ['node', 'Chrome Helper (Renderer)', 'WindowServer', 'zsh', 'postgres', 'bun', 'launchd', 'Code Helper', 'python3', 'docker'];
const base = Array.from({ length: PROCESSES }, (_, i) => ({
    pid: 100 + i, ppid: i < 10 ? 1 : 100 + Math.floor(random() * 10), name: names[i % names.length],
    command: `/usr/local/bin/${names[i % names.length]}`, user: i % 3 ? 'alice' : 'root', state: 'sleeping', startedAt: 1_790_000_000_000,
}));
// As on a real machine, most processes are idle (0.0% CPU, steady memory); about 15% are active.
const ACTIVE_EVERY = 7;
const tick = (n) => base.map((p) => (p.pid % ACTIVE_EVERY === 0
    ? { ...p, cpu: Math.round(random() * (p.pid % 17 === 0 ? 600 : 40)) / 10, memMB: 20 + ((p.pid * 37 + n) % 900) }
    : { ...p, cpu: 0, memMB: 20 + ((p.pid * 37) % 900) }));
const system = (n) => ({
    cpuPercent: 20 + (n % 30), cores: Array.from({ length: CORES }, (_, i) => (n * (i + 3)) % 100), load: [1.2, 1.4, 1.1],
    memUsedMB: 6000 + (n % 500), memTotalMB: 16384, memCachedMB: 3000, swapUsedMB: 100, swapTotalMB: 2048, uptimeSec: 86400 + n,
});

async function main() {
    const store = new Store({ meta: { version: 'bench', hostname: 'bench', platform: 'darwin', arch: 'arm64' } });
    const processManager = { shutdown: async () => {}, getLogs: () => ({ lines: [], total: 0 }), getEnv: () => ({}) };
    const actions = createActions({
        store, processManager, session: {}, systemControl: { getNice: () => 0 },
        context: { selfPid: 1, parentPid: 1, currentUser: 'alice' }, onQuit: async () => {}, sampler: { requestPorts() {} },
    });
    const env = { managerAvailable: process.argv.includes('--managed') };
    const ui = await createTestRenderer({ width: 160, height: 50 });
    createRoot(ui.renderer).render(
        <ThemeContext.Provider value={resolveTheme('truecolor')}>
            <App store={store} actions={actions} env={env} onQuit={() => {}} />
        </ThemeContext.Provider>,
    );
    const frame = async (n) => {
        store.setSystem(system(n));
        store.setProcesses(tick(n));
        // Production React has no act(): let it commit through the event loop, then draw the frame.
        await new Promise((resolve) => setImmediate(resolve));
        await ui.renderOnce();
    };
    for (let n = 0; n < 30; n++) await frame(n); // warm up (JIT, caches)
    const u0 = process.cpuUsage();
    const t0 = performance.now();
    for (let n = 30; n < 30 + FRAMES; n++) await frame(n);
    const u = process.cpuUsage(u0);
    const cpuMs = (u.user + u.system) / 1000 / FRAMES;
    process.stdout.write(`${FRAMES} frames, ${PROCESSES} processes, 160x50: ${cpuMs.toFixed(2)} ms CPU per frame (${((performance.now() - t0) / FRAMES).toFixed(2)} ms wall)\n`);
    const drawn = ui.captureCharFrame().split('\n').filter((l) => l.trim()).length;
    if (drawn < 40) throw new Error(`only ${drawn} lines drawn: the benchmark did not render the dashboard`);
    ui.renderer.destroy();
}

main();
