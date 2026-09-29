// Stack orchestration (PRD P2/P4): dependency waves, readiness gating, blocking, recovery, reverse stop.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { Store } = require('../../core/store');
const { ProcessManager } = require('../../core/processManager');
const { createOrchestrator } = require('../../core/stack/orchestrator');
const { computeDelay } = require('../../core/processManager/backoff');
const { isAlive } = require('../../core/systemControl');

const FIXTURE = path.join(__dirname, '..', '..', 'scripts', 'fixture-server.js');
const fixture = (args) => `"${process.execPath}" "${FIXTURE}" ${args}`;

const def = (name, cmd, extra = {}) => ({
    name, cmd, cwd: process.cwd(), env: {}, envFile: null, dependsOn: [], ready: null,
    restart: 'on-failure', maxRestarts: 10, stopSignal: 'SIGTERM', stopTimeoutMs: 2000, ...extra,
});

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

async function until(store, id, statuses) {
    const wanted = [].concat(statuses);
    while (!wanted.includes(store.getManaged(id)?.status)) await once(store, 'managed:status');
    return store.getManaged(id);
}

/** db (tcp) ← api (http) ← worker (log line), like the demo stack. */
async function setup(t, overrides = {}) {
    const store = new Store();
    const pm = new ProcessManager({ store, readinessIntervalMs: 20, computeDelay: (a) => computeDelay(a, { base: 20, max: 80 }) });
    const [dbPort, apiPort] = [await freePort(), await freePort()];
    const defs = [
        def('db', fixture(`--tcp ${dbPort} --delay 120`), { ready: { kind: 'port', target: dbPort, timeoutMs: 5000 } }),
        def('api', fixture(`--http ${apiPort} --delay 60`), { dependsOn: ['db'], ready: { kind: 'http', target: `http://127.0.0.1:${apiPort}/health`, timeoutMs: 5000 } }),
        def('worker', fixture('--ready-line "worker ready"'), { dependsOn: ['api'], ready: { kind: 'log', target: 'worker ready', timeoutMs: 5000 } }),
    ].map((d) => ({ ...d, ...(overrides[d.name] || {}) }));
    for (const d of defs) pm.register(d);
    const orchestrator = createOrchestrator({ pm, store, names: defs.map((d) => d.name) });
    t.after(() => orchestrator.stopStack().then(() => pm.shutdown()));
    return { store, pm, orchestrator };
}

test('startStack starts each wave only after the previous one is ready', async (t) => {
    const { store, orchestrator } = await setup(t);
    const events = [];
    store.on('managed:started', (m) => events.push(`start ${m.id}`));
    store.on('managed:ready', (e) => events.push(`ready ${e.id}`));
    const result = await orchestrator.startStack();
    assert.deepEqual(events, ['start db', 'ready db', 'start api', 'ready api', 'start worker', 'ready worker']);
    assert.deepEqual(result, { started: ['db', 'api', 'worker'], failed: [], blocked: [] });
    assert.deepEqual(store.getState().managed.map((m) => m.status), ['running', 'running', 'running']);
});

test('only starts the selected processes and their dependencies', async (t) => {
    const { store, orchestrator } = await setup(t);
    const result = await orchestrator.startStack({ only: ['api'] });
    assert.deepEqual(result.started, ['db', 'api']);
    assert.equal(store.getManaged('worker').status, 'idle');
    await assert.rejects(orchestrator.startStack({ only: ['nope'] }), /Unknown process "nope"/);
});

test('a failed dependency blocks its dependents (transitively) and their recovery starts them', async (t) => {
    const flag = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-orch-')), 'db-ok');
    t.after(() => fs.rmSync(path.dirname(flag), { recursive: true, force: true }));
    const dbPort = await freePort();
    const { store, pm, orchestrator } = await setup(t, {
        db: {
            cmd: `test -f "${flag}" && ${fixture(`--tcp ${dbPort}`)} || exit 4`,
            restart: 'never',
            ready: { kind: 'port', target: dbPort, timeoutMs: 5000 },
        },
    });
    const result = await orchestrator.startStack();
    assert.deepEqual(result, { started: [], failed: ['db'], blocked: ['api', 'worker'] });
    assert.deepEqual(store.getManaged('api').blockedBy, ['db']);
    assert.deepEqual(store.getManaged('worker').blockedBy, ['api']);
    assert.equal(store.getManaged('api').pid, null);

    fs.writeFileSync(flag, '');
    await pm.start('db'); // the user fixes the cause and starts db again
    await until(store, 'worker', 'running');
    assert.equal(store.getManaged('api').status, 'running');
});

test('an unready dependency blocks its dependents while it keeps running', async (t) => {
    const { store, orchestrator } = await setup(t, { db: { cmd: 'sleep 20', ready: { kind: 'port', target: 1, timeoutMs: 80 } } });
    const result = await orchestrator.startStack();
    assert.deepEqual(result.failed, ['db']);
    assert.equal(store.getManaged('db').status, 'unready');
    assert.ok(isAlive(store.getManaged('db').pid));
    assert.equal(store.getManaged('api').status, 'blocked');
});

test('stopStack stops in reverse dependency order, reports progress and leaves nothing running', async (t) => {
    const { store, pm, orchestrator } = await setup(t);
    await orchestrator.startStack();
    pm.spawnManaged('sleep 20', { id: 'extra' }); // ad-hoc processes stop first
    const pids = store.getState().managed.map((m) => m.pid);
    const progress = [];
    await orchestrator.stopStack({ onProgress: (id, phase) => progress.push(`${phase} ${id}`) });
    assert.deepEqual(progress, [
        'stopping extra', 'stopped extra', 'stopping worker', 'stopped worker',
        'stopping api', 'stopped api', 'stopping db', 'stopped db',
    ]);
    assert.ok(pids.every((pid) => !isAlive(pid)));
    // A stopped stack does not auto-start dependents when something becomes ready again.
    assert.equal(store.getManaged('worker').status, 'stopped');
});

test('a process removed while its wave is settling counts as failed instead of hanging the start (review finding)', async (t) => {
    const { store, pm, orchestrator } = await setup(t, { db: { cmd: 'sleep 20', ready: { kind: 'port', target: 1, timeoutMs: 60000 } } });
    const starting = orchestrator.startStack();
    await until(store, 'db', 'starting');
    await pm.removeManaged('db');
    const result = await starting;
    assert.deepEqual(result.failed, ['db']);
    assert.deepEqual(result.blocked, ['api', 'worker']);
});
