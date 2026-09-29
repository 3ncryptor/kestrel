// Renders the real App against a real Store + actions. System control is a recording fake, so the
// tests can prove that no signal is ever sent without a valid confirmation.
import { testRender } from '@opentui/react/test-utils';
import { act } from 'react';
import { Store } from '../../core/store/index.js';
import { createActions } from '../../core/actions/index.js';
import { compileFilter } from '../../core/processManager/logBuffer.js';
import { App } from '../../ui/App.jsx';
import { ThemeContext } from '../../ui/theme/context.js';
import { resolveTheme } from '../../ui/theme/capabilities.js';

export const proc = (pid, extra = {}) => ({
    pid, ppid: 1, name: `p${pid}`, command: `/usr/bin/p${pid}`, user: 'alice', state: 'sleeping', cpu: 0, memMB: 20, startedAt: 1759000000000, ...extra,
});

export const PROCS = [
    proc(1, { ppid: 0, name: 'launchd', command: '/sbin/launchd', user: 'root' }),
    proc(300, { name: 'Terminal', command: '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal' }),
    proc(301, { ppid: 300, name: 'zsh', command: '/bin/zsh' }),
    proc(812, { ppid: 301, name: 'node', command: '/usr/local/bin/node', cpu: 12.1, memMB: 412, state: 'running' }),
    proc(401, { name: 'Chrome Helper (Renderer)', command: '/Applications/Chrome.app/Helper', cpu: 58.4, memMB: 1228.8, state: 'running' }),
    proc(99, { name: 'WindowServer', command: '/System/WindowServer', user: '_windowserver', cpu: 5.2, memMB: 180, state: 'running' }),
];

export const SYSTEM = {
    cpuPercent: 42, cores: [12, 80, 30, 5], load: [1.2, 1.4, 1.1], memUsedMB: 8396, memTotalMB: 16384,
    memCachedMB: 3174, swapUsedMB: 0, swapTotalMB: 2048, uptimeSec: 3 * 86400 + 4 * 3600,
};

let mounted = null;

/** A managed entry as the process manager publishes it. */
export const managedEntry = (id, extra = {}) => ({
    id, cmd: `node ${id}.js`, cwd: '/work/app', status: 'idle', pid: null, startedAt: null, restartCount: 0, exitCode: null,
    signal: null, nextRestartAt: null, restart: 'on-failure', ready: null, blockedBy: [], resources: null, memHistory: [],
    leakSuspect: false, dependsOn: [], logCount: 0, ...extra,
});

/** Recording stand-ins for the process manager and the stack session (the core has its own tests). */
function fakeEngine(store, { logs, envs, calls }) {
    const processManager = {
        shutdown: async () => {},
        getLogs: (id, { filter = '', limit = 200 } = {}) => {
            const matches = (logs[id] || []).filter(compileFilter(filter));
            return { lines: matches.slice(-limit), total: matches.length };
        },
        getEnv: (id) => envs[id] || {},
        start: async (id) => calls.push(['start', id]),
        killManaged: async (id) => calls.push(['stop', id]),
        restartManaged: async (id) => calls.push(['restart', id]),
        spawnManaged: (cmd, { id }) => {
            calls.push(['addAdHoc', id, cmd]);
            return { id: id || 'derived' };
        },
    };
    const session = {
        startStack: async () => {
            calls.push(['startStack']);
            return { started: store.getState().managed.map((m) => m.id), failed: [], blocked: [] };
        },
        stopStack: async () => {
            calls.push(['stopStack']);
            store.setStack({ phase: 'stopping', stopProgress: { worker: 'stopped', api: 'stopping' } });
        },
        adoptScripts: async (names, options) => {
            calls.push(['adoptScripts', names, options]);
            return { started: names, failed: [], blocked: [] };
        },
        saveAdHoc: (id) => {
            calls.push(['saveAdHoc', id]);
            return { path: '/work/app/kestrel.json' };
        },
        stopOrphans: async () => {
            calls.push(['stopOrphans']);
            const stopped = store.getState().orphans.length;
            store.setOrphans([]);
            return { stopped };
        },
        dismissOrphans: () => {
            calls.push(['dismissOrphans']);
            return store.setOrphans([]);
        },
    };
    return { processManager, session };
}

export async function setup({
    width = 120, height = 40, depth = 'truecolor', env = { managerAvailable: true },
    procs = PROCS, system = SYSTEM, ports = null, stack = null, managed = [], logs = {}, envs = {}, orphans = [],
} = {}) {
    const store = new Store({ meta: { version: '0.1.0', hostname: 'mbp', platform: 'darwin', arch: 'arm64' } });
    if (system) {
        store.setSystem({ ...system, cpuPercent: 38 });
        store.setSystem(system);
    }
    if (procs) store.setProcesses(procs);
    if (ports) store.setPorts(ports);
    const signals = [];
    const systemControl = {
        killByPid: (pid, signal) => signals.push(['kill', pid, signal]),
        renice: async (pid, nice) => {
            if (nice < 0) throw Object.assign(new Error(`Permission denied: raising the priority of ${pid} needs sudo`), { code: 'EPERM' });
            signals.push(['renice', pid, nice]);
        },
        getNice: () => 0,
    };
    if (stack) store.setStack(stack);
    for (const m of managed) store.upsertManaged(m);
    if (orphans.length) store.setOrphans(orphans);
    const calls = [];
    const { processManager, session } = fakeEngine(store, { logs, envs, calls });
    let quits = 0;
    const actions = createActions({
        store,
        processManager,
        session,
        systemControl,
        context: { selfPid: 500, parentPid: 499, currentUser: 'alice' },
        onQuit: async () => {
            quits += 1;
            await session.stopStack(); // as createKestrel's stop() does
        },
        sampler: { requestPorts: () => {} },
    });
    const ui = await testRender(
        <ThemeContext.Provider value={resolveTheme(depth)}>
            <App store={store} actions={actions} env={env} onQuit={() => actions.quit()} />
        </ThemeContext.Provider>,
        { width, height }
    );
    mounted = ui;
    return { ui, store, actions, signals, calls, quits: () => quits };
}

export async function teardown() {
    if (!mounted) return;
    const ui = mounted;
    mounted = null;
    act(() => ui.renderer.destroy());
}

export async function frame(ui) {
    await act(async () => {
        await ui.renderOnce();
    });
    return ui.captureCharFrame();
}

/** Types printable keys one by one, e.g. keys(ui, 'x'), keys(ui, '/node'). */
export async function keys(ui, text) {
    for (const ch of text) {
        await act(async () => {
            await ui.mockInput.typeText(ch);
        });
    }
    return frame(ui);
}

// Keys the mock has no KeyCodes name for, as the bytes a terminal sends.
const RAW_KEYS = { pageup: '\x1b[5~', pagedown: '\x1b[6~' };

// A lone ESC byte is only reported after the parser's escape-sequence timeout.
const ESCAPE_SETTLE_MS = 60;

export async function press(ui, name) {
    await act(async () => {
        const input = ui.mockInput;
        if (name === 'enter') input.pressEnter();
        else if (name === 'escape') input.pressEscape();
        else if (name === 'tab') input.pressTab();
        else if (['up', 'down', 'left', 'right'].includes(name)) input.pressArrow(name);
        else if (RAW_KEYS[name]) input.pressKey(RAW_KEYS[name]);
        else input.pressKey(name.toUpperCase()); // mock KeyCodes names, e.g. BACKSPACE
        if (name === 'escape') await new Promise((r) => setTimeout(r, ESCAPE_SETTLE_MS));
    });
    return frame(ui);
}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');

/** Foreground color (hex) of the first span containing `needle` in the current frame. */
export function colorOf(ui, needle) {
    for (const line of ui.captureSpans().lines) {
        const span = line.spans.find((s) => s.text.includes(needle));
        if (span) {
            const [r, g, b] = span.fg.toInts();
            return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
        }
    }
    return null;
}

/** Every distinct foreground color used in the frame. */
export function allColors(ui) {
    const colors = new Set();
    for (const line of ui.captureSpans().lines) {
        for (const s of line.spans) {
            if (!s.text.trim()) continue;
            const [r, g, b] = s.fg.toInts();
            colors.add(`#${hex2(r)}${hex2(g)}${hex2(b)}`);
        }
    }
    return colors;
}
