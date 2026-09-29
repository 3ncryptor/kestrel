// Generates the website's data from the real product (website/src/generated/, committed):
//   hero-*.json  the real dashboard, rendered headlessly frame by frame (scripts/website/scenario.js)
//   keys.json    every key binding, from ui/keymap.js (what `?` shows in the app)
//   cli.json     real CLI output: --version, --help, and `kestrel init` in a Procfile project
//   tokens.css   the palette and semantic tokens of ui/theme/tokens.js as CSS variables
//
//   bun run website:generate        (CI fails when the committed files differ from a fresh run)
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../core/store/index.js';
import { createActions } from '../../core/actions/index.js';
import { compileFilter } from '../../core/processManager/logBuffer.js';
import { App } from '../../ui/App.jsx';
import { KEYMAP, helpFor } from '../../ui/keymap.js';
import { ThemeContext } from '../../ui/theme/context.js';
import { resolveTheme } from '../../ui/theme/capabilities.js';
import { PALETTE, SEMANTIC } from '../../ui/theme/tokens.js';
import frames from './frames.js';
import scenario from './scenario.js';

const ROOT = path.join(import.meta.dir, '..', '..');
const OUT = path.join(ROOT, 'website', 'src', 'generated');
const HERO_BUDGET_BYTES = 60 * 1024; // gzipped, the plan's budget for the animated hero
const HERO_SHOT_TICK = 14; // the single-frame variants show the crash being handled

// The views and their sizes follow Kestrel's own breakpoints (ui/logic/layout.js).
const VIEWS = [
    { name: 'standard', width: 100, height: 30, depth: 'truecolor', ticks: scenario.TICKS },
    { name: 'compact', width: 64, height: 26, depth: 'truecolor', ticks: 1 },
    { name: 'wide', width: 150, height: 34, depth: 'truecolor', ticks: 1 },
    { name: 'mono', width: 100, height: 30, depth: 'none', ticks: 1 },
    // Kestrel's own quit dialog, as `q` opens it with the stack running (the site's q easter egg).
    { name: 'quit', width: 100, height: 30, depth: 'truecolor', ticks: 1, press: 'q' },
];

const settle = () => new Promise((resolve) => setImmediate(resolve));
// Production React (no act()) runs passive effects, such as useKeyboard's subscription, after paint.
const EFFECTS_MS = 50;
const effects = () => new Promise((resolve) => setTimeout(resolve, EFFECTS_MS));

/** A store and actions wired to the scenario instead of a real engine (nothing is spawned or killed). */
function wire() {
    let tick = 0;
    const store = new Store({ meta: scenario.META });
    const processManager = {
        shutdown: async () => {},
        getLogs: (id, { filter = '', limit = 200 } = {}) => {
            const matches = (scenario.logsAt(tick)[id] || []).filter(compileFilter(filter));
            return { lines: matches.slice(-limit), total: matches.length };
        },
        getEnv: () => ({}),
    };
    const actions = createActions({
        store, processManager, session: {}, systemControl: { getNice: () => 0 },
        context: { selfPid: scenario.PIDS.kestrel, parentPid: scenario.PIDS.zsh, currentUser: scenario.USER },
        onQuit: async () => {}, sampler: { requestPorts() {} },
    });
    return { store, actions, setTick: (t) => (tick = t) };
}

function apply(store, t) {
    Date.now = () => scenario.clock(t);
    store.setSystem(scenario.systemAt(t));
    store.setProcesses(scenario.processesAt(t));
    for (const m of scenario.managedAt(t)) store.upsertManaged(m);
}

async function render(view) {
    const realNow = Date.now;
    const { store, actions, setTick } = wire();
    const first = view.ticks === 1 ? HERO_SHOT_TICK : 0;
    for (let t = first - scenario.PREFILL; t < first; t++) {
        Date.now = () => scenario.clock(t);
        store.setSystem(scenario.systemAt(t));
    }
    store.setStack(scenario.STACK);
    store.setPorts(scenario.PORTS);
    setTick(first);
    apply(store, first);

    const ui = await createTestRenderer({ width: view.width, height: view.height });
    createRoot(ui.renderer).render(
        <ThemeContext.Provider value={resolveTheme(view.depth)}>
            <App store={store} actions={actions} env={{ managerAvailable: true }} onQuit={() => {}} />
        </ThemeContext.Provider>,
    );
    await settle();
    await ui.renderOnce();
    await effects();
    // As a user would: Tab to the managed box (the big panel becomes its logs), v for every process's logs.
    ui.mockInput.pressTab();
    await effects();
    await ui.mockInput.typeText('v');
    await effects();
    if (view.press) {
        await ui.mockInput.typeText(view.press);
        await effects();
    }

    const captured = [];
    for (let t = first; t < first + view.ticks; t++) {
        setTick(t);
        apply(store, t);
        await settle();
        await ui.renderOnce();
        captured.push(frames.normalizeFrame(ui.captureSpans()));
    }
    ui.renderer.destroy();
    Date.now = realNow;
    return frames.encodeFrames(captured);
}

function keysData() {
    const env = { managerAvailable: true };
    const contexts = Object.keys(KEYMAP).filter((c) => c !== 'global' && c !== 'help');
    const own = contexts.map((context) => {
        const [group] = helpFor(context, env);
        return { context, title: group.title, entries: group.entries.map((e) => ({ keys: e.keys, label: e.label })) };
    });
    const everywhere = helpFor(contexts[0], env).at(-1);
    return [{ context: 'global', title: everywhere.title, entries: everywhere.entries.map((e) => ({ keys: e.keys, label: e.label })) }, ...own];
}

function cliData() {
    const kestrel = (args, cwd = ROOT) => execFileSync('bun', [path.join(ROOT, 'cli', 'index.js'), ...args], {
        cwd, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1', NODE_ENV: 'production' },
    }).trimEnd();
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-site-'));
    try {
        fs.mkdirSync(path.join(project, 'myapp'));
        fs.writeFileSync(path.join(project, 'myapp', 'Procfile'), 'web: npm run dev\nworker: node worker.js\n');
        const init = kestrel(['init', '--yes'], path.join(project, 'myapp'));
        const config = fs.readFileSync(path.join(project, 'myapp', 'kestrel.json'), 'utf-8').trimEnd();
        return { version: kestrel(['--version']), help: kestrel(['--help']), init, initConfig: config, procfile: 'web: npm run dev\nworker: node worker.js' };
    } finally {
        fs.rmSync(project, { recursive: true, force: true });
    }
}

function tokensCss() {
    const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const lines = ['/* Generated by scripts/website/generate.jsx from ui/theme/tokens.js. Do not edit. */', ':root {'];
    for (const [name, hex] of Object.entries(PALETTE)) lines.push(`  --k-${kebab(name)}: ${hex};`);
    for (const [group, entries] of Object.entries(SEMANTIC)) {
        for (const [role, name] of Object.entries(entries)) lines.push(`  --k-${kebab(group)}-${kebab(role)}: var(--k-${kebab(name)});`);
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
}

function write(name, content) {
    fs.writeFileSync(path.join(OUT, name), content);
    process.stdout.write(`wrote website/src/generated/${name} (${Buffer.byteLength(content)} bytes)\n`);
}

async function main() {
    // Log timestamps are shown in local time: pin UTC so every machine renders the same frames.
    if (new Date(scenario.EPOCH).getTimezoneOffset() !== 0) throw new Error('run with TZ=UTC (bun run website:generate does)');
    fs.mkdirSync(OUT, { recursive: true });
    for (const view of VIEWS) {
        const encoded = await render(view);
        const size = frames.gzipSize(encoded);
        if (view.ticks > 1 && size > HERO_BUDGET_BYTES) {
            throw new Error(`hero-${view.name}.json is ${size} bytes gzipped, over the ${HERO_BUDGET_BYTES} budget: use fewer frames`);
        }
        write(`hero-${view.name}.json`, `${JSON.stringify(encoded)}\n`);
        process.stdout.write(`  ${view.width}x${view.height}, ${encoded.frames.length} frames, ${size} bytes gzipped\n`);
    }
    write('keys.json', `${JSON.stringify(keysData(), null, 2)}\n`);
    write('cli.json', `${JSON.stringify(cliData(), null, 2)}\n`);
    write('tokens.css', tokensCss());
}

main().catch((err) => {
    process.stderr.write(`website:generate: ${err.stack || err.message}\n`);
    process.exitCode = 1;
});
