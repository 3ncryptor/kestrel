// M3 supervisor behaviour against real child processes (BUILD_PLAN §8.4).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { Store } = require('../../core/store');
const { ProcessManager } = require('../../core/processManager');
const { computeDelay } = require('../../core/processManager/backoff');
const { isAlive } = require('../../core/systemControl');

const FIXTURE = path.join(__dirname, '..', '..', 'scripts', 'fixture-server.js');
const fixture = (args) => `"${process.execPath}" "${FIXTURE}" ${args}`;
const fastDelay = (attempt) => computeDelay(attempt, { base: 20, max: 80 });

function setup(t, opts = {}) {
    const store = new Store();
    const pm = new ProcessManager({ store, computeDelay: fastDelay, readinessIntervalMs: 20, ...opts });
    t.after(() => pm.shutdown());
    return { store, pm };
}

/** A config-style process definition (as produced by core/config/schema.js). */
const def = (name, cmd, extra = {}) => ({
    name, cmd, cwd: process.cwd(), env: {}, envFile: null, dependsOn: [], ready: null,
    restart: 'on-failure', maxRestarts: 10, stopSignal: 'SIGTERM', stopTimeoutMs: 2000, ...extra,
});

async function until(store, id, statuses) {
    const wanted = [].concat(statuses);
    while (!wanted.includes(store.getManaged(id)?.status)) await once(store, 'managed:status');
    return store.getManaged(id);
}

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

test('register adds a process as idle without starting it; start launches it', async (t) => {
    const { store, pm } = setup(t);
    pm.register(def('api', 'sleep 20'));
    const entry = store.getManaged('api');
    assert.equal(entry.status, 'idle');
    assert.equal(entry.pid, null);
    assert.equal(entry.restart, 'on-failure');
    await pm.start('api');
    assert.equal(store.getManaged('api').status, 'running');
    assert.ok(isAlive(store.getManaged('api').pid));
    await pm.start('api'); // already running: no second process
    assert.equal(pm.list().length, 1);
});

test('a port readiness check keeps the process "starting" until the port answers', async (t) => {
    const { store, pm } = setup(t);
    const port = await freePort();
    pm.register(def('db', fixture(`--tcp ${port} --delay 150`), { ready: { kind: 'port', target: port, timeoutMs: 5000 } }));
    const ready = once(store, 'managed:ready');
    await pm.start('db');
    assert.equal(store.getManaged('db').status, 'starting');
    const [info] = await ready;
    assert.equal(info.id, 'db');
    assert.equal(store.getManaged('db').status, 'running');
    assert.deepEqual(store.getManaged('db').ready, { kind: 'port', target: port, ok: true });
});

test('http and log readiness checks', async (t) => {
    const { store, pm } = setup(t);
    const port = await freePort();
    pm.register(def('api', fixture(`--http ${port} --delay 100`), { ready: { kind: 'http', target: `http://127.0.0.1:${port}/health`, timeoutMs: 5000 } }));
    pm.register(def('worker', fixture('--delay 100 --ready-line "worker ready"'), { ready: { kind: 'log', target: 'worker ready', timeoutMs: 5000 } }));
    await Promise.all([pm.start('api'), pm.start('worker')]);
    await until(store, 'api', 'running');
    await until(store, 'worker', 'running');
});

test('a readiness timeout marks the process unready but leaves it running', async (t) => {
    const { store, pm } = setup(t);
    const port = await freePort();
    pm.register(def('slow', 'sleep 20', { ready: { kind: 'port', target: port, timeoutMs: 100 } }));
    await pm.start('slow');
    const entry = await until(store, 'slow', 'unready');
    assert.ok(isAlive(entry.pid));
    assert.equal(entry.ready.ok, false);
});

test('restart "never" leaves a crashed process crashed', async (t) => {
    const { store, pm } = setup(t);
    pm.register(def('once', fixture('--exit-after 30 --exit-code 3'), { restart: 'never' }));
    await pm.start('once');
    const entry = await until(store, 'once', 'crashed');
    assert.equal(entry.exitCode, 3);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(store.getManaged('once').status, 'crashed');
});

test('restart "always" restarts even after a clean exit', async (t) => {
    const { store, pm } = setup(t);
    pm.register(def('loop', fixture('--exit-after 30 --exit-code 0'), { restart: 'always' }));
    const restarting = once(store, 'managed:restarting');
    await pm.start('loop');
    await restarting;
    assert.equal(store.getManaged('loop').restartCount, 1);
});

test('after maxRestarts consecutive crashes the process is errored and a danger alert is raised', async (t) => {
    const { store, pm } = setup(t);
    pm.register(def('crashy', fixture('--exit-after 10 --exit-code 2'), { maxRestarts: 2 }));
    await pm.start('crashy');
    const entry = await until(store, 'crashy', 'errored');
    assert.equal(entry.restartCount, 2);
    const alert = store.getState().alerts.find((a) => a.id === 'errored:crashy');
    assert.equal(alert.level, 'danger');
    assert.match(alert.message, /crashy stopped after 3 crashes/);
    await pm.start('crashy'); // a manual start resets the streak
    assert.notEqual(store.getManaged('crashy').status, 'errored');
});

test('env precedence reaches the child, and a missing explicit envFile errors clearly', async (t) => {
    const { store, pm } = setup(t);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-env-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, '.env'), 'FROM_FILE=file\nOVERRIDE=file\n');
    pm.register(def('envy', fixture('--echo-env FROM_FILE,OVERRIDE'), {
        cwd: dir, env: { OVERRIDE: 'inline' }, envFile: { path: path.join(dir, '.env'), optional: false },
    }));
    const lines = [];
    store.on('managed:log', (e) => e.id === 'envy' && lines.push(e.line.text));
    await pm.start('envy');
    while (lines.length < 2) await once(store, 'managed:log');
    assert.deepEqual(lines.slice(0, 2), ['env FROM_FILE=file', 'env OVERRIDE=inline']);

    pm.register(def('broken', 'sleep 1', { envFile: { path: path.join(dir, 'missing.env'), optional: false } }));
    await pm.start('broken');
    assert.equal(store.getManaged('broken').status, 'errored');
    assert.match(pm.getLogs('broken').lines.at(-1).text, /env file not found/);
});

test('stop uses the process stopSignal, and escalates to SIGKILL after stopTimeoutMs', async (t) => {
    const { store, pm } = setup(t);
    pm.register(def('polite', fixture('--trap SIGINT'), { stopSignal: 'SIGINT' }));
    pm.register(def('stubborn', fixture('--ignore-term'), { stopTimeoutMs: 150 }));
    await Promise.all([pm.start('polite'), pm.start('stubborn')]);
    await new Promise((r) => setTimeout(r, 150));
    const stubbornPid = store.getManaged('stubborn').pid;
    await pm.killManaged('polite');
    assert.ok(pm.getLogs('polite').lines.some((l) => l.text === 'got SIGINT'));
    const t0 = Date.now();
    await pm.killManaged('stubborn');
    assert.ok(Date.now() - t0 >= 140, 'waited for the timeout before SIGKILL');
    assert.equal(isAlive(stubbornPid), false);
});

test('block marks a process blocked by its dependency without starting it', (t) => {
    const { store, pm } = setup(t);
    pm.register(def('api', 'sleep 20'));
    pm.block('api', ['db']);
    assert.equal(store.getManaged('api').status, 'blocked');
    assert.deepEqual(store.getManaged('api').blockedBy, ['db']);
});

test('logs are also written to <logDir>/<id>.log when a log directory is set', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-plogs-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const { store, pm } = setup(t, { logDir: dir, logFlushMs: 10 });
    pm.register(def('talker', fixture('--ready-line hello-file')));
    await pm.start('talker');
    while (!pm.getLogs('talker').lines.some((l) => l.text === 'hello-file')) await once(store, 'managed:log');
    await pm.killManaged('talker');
    assert.match(fs.readFileSync(path.join(dir, 'talker.log'), 'utf-8'), /stdout hello-file/);
});

test('the run state lists live children, and is cleared when everything stops', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-prun-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const runStatePath = path.join(dir, 'run.json');
    const { store, pm } = setup(t, { runStatePath });
    pm.register(def('a', 'sleep 20'));
    await pm.start('a');
    const recorded = JSON.parse(fs.readFileSync(runStatePath, 'utf-8'));
    assert.deepEqual(recorded.children.map((c) => [c.id, c.pid]), [['a', store.getManaged('a').pid]]);
    await pm.shutdown();
    assert.equal(fs.existsSync(runStatePath), false);
});

test('definitionOf and definitions expose the config view used by saveAdHoc and the orchestrator', (t) => {
    const { pm } = setup(t);
    pm.register(def('api', 'npm start', { dependsOn: ['db'] }));
    assert.equal(pm.definitionOf('api').cmd, 'npm start');
    assert.deepEqual(pm.definitions().map((d) => d.name), ['api']);
});
