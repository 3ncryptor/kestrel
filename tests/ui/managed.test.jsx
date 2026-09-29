// Frame tests for the process manager UI (M3): managed box, logs panel, stack dialogs (UI_SPEC §6.5–§6.7).
import { afterEach, expect, test } from 'bun:test';
import { setup, teardown, frame, keys, press, colorOf, managedEntry } from './helpers.jsx';
import { PALETTE } from '../../ui/theme/tokens.js';

afterEach(teardown);

const NOW = Date.now();
const line = (seq, text, stream = 'stdout', ts = NOW - 10_000 + seq * 100) => ({ seq, ts, stream, text });

const STACK = { name: 'myapp', source: 'kestrel.json', path: '/work/app/kestrel.json', errors: [], scripts: null };
const MANAGED = [
    managedEntry('db', { status: 'running', pid: 812, startedAt: NOW - 60_000, ready: { kind: 'port', target: 5432, ok: true } }),
    managedEntry('api', { status: 'restarting', restartCount: 3, nextRestartAt: NOW + 3500, dependsOn: ['db'] }),
    managedEntry('worker', { status: 'blocked', blockedBy: ['api'] }),
    managedEntry('cron', { status: 'idle' }),
];
const LOGS = {
    db: [line(1, 'listening on 5432'), line(2, '\x1b[33mslow query\x1b[0m 120ms', 'stderr'), line(3, 'GET /users 200'), line(4, '[kestrel] restarted', 'system')],
    api: [line(1, 'api booting'), line(2, 'crash: ECONNREFUSED', 'stderr')],
};

const stackSetup = (extra = {}) => setup({ stack: STACK, managed: MANAGED, logs: LOGS, ...extra });

async function focusManaged(ui) {
    await press(ui, 'tab');
    return frame(ui);
}

// ---------- managed box (U1) ----------

test('the managed box lists the stack with a glyph and a status that says what is going on', async () => {
    const { ui } = await stackSetup();
    const out = await frame(ui);
    expect(out).toContain('managed · myapp');
    expect(out).toContain('1/4');
    expect(out).toMatch(/● db\s+ready :5432/);
    expect(out).toMatch(/↻ api\s+retry 3 in 4s/);
    expect(out).toMatch(/⊘ worker\s+blocked by api/);
    expect(out).toMatch(/○ cron\s+idle/);
});

test('S2/S3: no stack says how to make one; an invalid config shows its problems', async () => {
    const none = await setup();
    const empty = await frame(none.ui);
    expect(empty).toContain('No stack here');
    expect(empty).toContain('kestrel init');
    await teardown();

    const errors = [{ path: 'processes.api.restart', message: 'must be one of: on-failure, always, never' }, { path: 'version', message: 'must be 1' }];
    const bad = await setup({ stack: { ...STACK, errors } });
    const out = await frame(bad.ui);
    expect(out).toContain('config has 2 problems');
    expect(out).toContain('processes.api.restart');
});

test('kestrel sm has no managed box, and Tab skips it', async () => {
    const { ui, store } = await stackSetup({ env: { managerAvailable: false } });
    expect(await frame(ui)).not.toContain('managed');
    await press(ui, 'tab');
    expect(store.getState().ui.focus).toBe('ports');
});

// ---------- logs panel (U2) ----------

test('focusing managed turns the big panel into the selected process logs, plain text only', async () => {
    const { ui } = await stackSetup();
    const out = await focusManaged(ui);
    expect(out).toContain('logs · db');
    expect(out).toContain('following ●');
    expect(out).toContain('4 lines');
    expect(out).toContain('listening on 5432');
    expect(out).toContain('▎'); // the stderr marker
    expect(out).toContain('slow query 120ms'); // colors stripped
    expect(out).not.toContain('[33m');
    expect(out).toContain('f follow');
    expect(colorOf(ui, '▎')).toBe(PALETTE.peach);
});

test('↓ selects the next process and its logs; v interleaves every process', async () => {
    const { ui } = await stackSetup();
    await focusManaged(ui);
    expect(await press(ui, 'down')).toContain('logs · api');
    const all = await keys(ui, 'v');
    expect(all).toContain('logs · all');
    expect(all).toMatch(/db\s+listening on 5432/);
    expect(all).toMatch(/api\s+crash: ECONNREFUSED/);
});

test('/ searches the logs with a match count; Esc clears it', async () => {
    const { ui, store } = await stackSetup();
    await focusManaged(ui);
    const out = await keys(ui, '/users');
    expect(store.getState().ui.logFilter).toBe('users');
    expect(out).toContain('1 match');
    expect(out).toContain('GET /users 200');
    expect(out).not.toContain('listening on 5432');
    expect(colorOf(ui, 'users')).toBe(PALETTE.mauve);
    await press(ui, 'enter');
    const cleared = await press(ui, 'escape');
    expect(cleared).toContain('listening on 5432');
});

test('scrolling back pauses, counts new lines, and G follows again', async () => {
    const logs = { db: Array.from({ length: 60 }, (_, i) => line(i + 1, `line ${i + 1}`)) };
    const { ui, store } = await stackSetup({ logs });
    await focusManaged(ui);
    const paused = await press(ui, 'pageup');
    expect(store.getState().ui.logFollow).toBe(false);
    expect(paused).toContain('paused · 0 new');
    expect(paused).not.toContain('line 60');

    logs.db.push(line(61, 'line 61'), line(62, 'line 62'));
    store.upsertManaged({ id: 'db', logCount: 62 });
    const counted = await frame(ui);
    expect(counted).toContain('paused · 2 new');
    expect(counted).not.toContain('line 62');

    const following = await keys(ui, 'G');
    expect(following).toContain('following ●');
    expect(following).toContain('line 62');
});

// ---------- process keys (U3) ----------

test('s x r a act on the manager and report the outcome', async () => {
    const { ui, calls } = await stackSetup();
    await focusManaged(ui);
    await keys(ui, 's');
    await keys(ui, 'x');
    await keys(ui, 'r');
    const out = await keys(ui, 'a');
    expect(calls).toEqual([['start', 'db'], ['stop', 'db'], ['restart', 'db'], ['startStack']]);
    expect(out).toContain('Started 4');
});

test('L jumps from a failed-process alert to its logs (S8)', async () => {
    const { ui, store } = await stackSetup();
    store.addAlert({ id: 'errored:api', level: 'danger', source: 'managed:api', message: 'api stopped after 11 crashes (last exit 1) · see its logs' });
    expect(await frame(ui)).toContain('· L show logs');
    const out = await keys(ui, 'L');
    expect(store.getState().ui.focus).toBe('managed');
    expect(out).toContain('logs · api');
});

// ---------- dialogs (U4) ----------

test('S12: quitting with processes running asks first, then shows the stop progress', async () => {
    const { ui, quits } = await stackSetup();
    const ask = await keys(ui, 'q');
    expect(ask).toContain('Stop 2 running processes and quit?');
    expect(quits()).toBe(0);
    const progress = await keys(ui, 'y');
    expect(quits()).toBe(1);
    expect(progress).toContain('Stopping the stack');
    expect(progress).toMatch(/✓ worker stopped/);
    expect(progress).toMatch(/api stopping…/);
});

test('quitting with nothing running does not ask', async () => {
    const { ui, quits } = await stackSetup({ managed: [managedEntry('cron')] });
    await keys(ui, 'q');
    expect(quits()).toBe(1);
});

test('S13: processes left by a previous session are shown first; s stops them, Esc leaves them', async () => {
    const orphans = [{ id: 'api', pid: 4242, pgid: 4242, startedAt: NOW - 90_000 }];
    const stopped = await stackSetup({ orphans });
    const out = await frame(stopped.ui);
    expect(out).toContain('1 process from a previous Kestrel is still running');
    expect(out).toContain('s stop it');
    expect(out).toContain('api · pid 4242');
    expect(await keys(stopped.ui, 's')).toContain('Stopped 1 left-over process');
    expect(stopped.calls).toEqual([['stopOrphans']]);
    await teardown();

    const left = await stackSetup({ orphans });
    await press(left.ui, 'escape');
    expect(left.calls).toEqual([['dismissOrphans']]);
    expect(await frame(left.ui)).not.toContain('previous Kestrel');
});

test('n starts an ad-hoc process from "name: command"', async () => {
    const { ui, calls } = await stackSetup();
    await focusManaged(ui);
    expect(await keys(ui, 'n')).toContain('New process');
    await keys(ui, 'web: npm run dev');
    const out = await press(ui, 'enter');
    expect(calls).toEqual([['addAdHoc', 'web', 'npm run dev']]);
    expect(out).toContain('Started web');
});

test('e shows the env masked until r reveals it; w saves the process to kestrel.json', async () => {
    const { ui, calls } = await stackSetup({ envs: { db: { PGPASSWORD: 'hunter2', PGPORT: '5432' } } });
    await focusManaged(ui);
    const masked = await keys(ui, 'e');
    expect(masked).toContain('Environment · db');
    expect(masked).toContain('PGPASSWORD');
    expect(masked).not.toContain('hunter2');
    expect(await keys(ui, 'r')).toContain('hunter2');
    await press(ui, 'escape');
    expect(await keys(ui, 'w')).toContain('Saved db to /work/app/kestrel.json');
    expect(calls).toEqual([['saveAdHoc', 'db']]);
});

test('a package.json project offers the script picker; space toggles, w starts and saves', async () => {
    const scripts = [
        { name: 'dev', command: 'vite', preselected: true },
        { name: 'build', command: 'vite build', preselected: false },
    ];
    const { ui, calls, actions } = await setup({ stack: { ...STACK, source: 'package.json', scripts } });
    expect(await frame(ui)).toContain('⏎ pick the ones to run');
    actions.setFocus('managed');
    await frame(ui); // the picker opens from an effect after this render
    const picker = await frame(ui);
    expect(picker).toContain('Which scripts should run?');
    expect(picker).toMatch(/\[x\] dev/);
    await press(ui, 'down');
    expect(await keys(ui, ' ')).toMatch(/\[x\] build/);
    await keys(ui, 'w');
    expect(calls).toEqual([['adoptScripts', ['dev', 'build'], { save: true }]]);
});

// ---------- proc integration (U5) ----------

test('killing a managed process from proc offers m: stop it through the manager', async () => {
    const { ui, actions, calls, signals } = await stackSetup();
    actions.select(812);
    expect(await keys(ui, 'x')).toContain('db is managed by Kestrel');
    await keys(ui, 'm');
    expect(calls).toEqual([['stop', 'db']]);
    expect(signals).toEqual([]);
});
