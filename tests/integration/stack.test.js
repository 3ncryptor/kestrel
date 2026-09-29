// The stack through the public contract (createKestrel + actions), as `kestrel pm` uses it (M3 E7/E8).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createKestrel } = require('../../core');
const { loadStack } = require('../../core/config');
const { isAlive } = require('../../core/systemControl');

const FIXTURE = path.join(__dirname, '..', '..', 'scripts', 'fixture-server.js');
const node = JSON.stringify(process.execPath);

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

function project(t, files) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-stack-')));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    return dir;
}

function open(t, dir) {
    const kestrel = createKestrel({ stack: loadStack({ cwd: dir, stopAt: dir }), cwd: dir });
    t.after(() => kestrel.stop());
    return kestrel;
}

async function demoStack(t) {
    const port = await freePort();
    return project(t, {
        'kestrel.json': {
            version: 1,
            processes: {
                db: { cmd: `${node} ${JSON.stringify(FIXTURE)} --tcp ${port} --delay 50`, ready: { port } },
                worker: { cmd: `${node} ${JSON.stringify(FIXTURE)} --ready-line up`, dependsOn: ['db'], ready: { log: 'up' } },
            },
        },
    });
}

test('a configured stack is registered idle and described in state.stack; nothing runs', async (t) => {
    const dir = await demoStack(t);
    const { store } = open(t, dir);
    const { stack, managed } = store.getState();
    assert.equal(stack.source, 'kestrel.json');
    assert.equal(stack.path, path.join(dir, 'kestrel.json'));
    assert.equal(stack.name, path.basename(dir));
    assert.equal(stack.phase, 'idle');
    assert.deepEqual(managed.map((m) => [m.id, m.status, m.pid]), [['db', 'idle', null], ['worker', 'idle', null]]);
    assert.equal(store.getState().meta.configSource, 'kestrel.json');
});

test('startStack starts in order; quit stops everything and reports progress', async (t) => {
    const dir = await demoStack(t);
    const { store, actions } = open(t, dir);
    const started = await actions.startStack();
    assert.equal(started.ok, true, started.error);
    assert.deepEqual(started.data.started, ['db', 'worker']);
    assert.equal(store.getState().stack.phase, 'running');
    const pids = store.getState().managed.map((m) => m.pid);

    assert.equal((await actions.quit()).ok, true);
    const { stack } = store.getState();
    assert.equal(stack.phase, 'stopped');
    assert.deepEqual(stack.stopProgress, { worker: 'stopped', db: 'stopped' });
    assert.ok(pids.every((pid) => !isAlive(pid)));
    assert.ok(fs.existsSync(path.join(dir, '.kestrel', 'logs', 'worker.log')));
    assert.equal(fs.existsSync(path.join(dir, '.kestrel', 'run.json')), false);
});

test('an invalid config registers nothing and startStack explains why', async (t) => {
    const dir = project(t, { 'kestrel.json': { version: 1, processes: { api: { cmd: 'x', restart: 'sometimes' } } } });
    const { store, actions } = open(t, dir);
    assert.equal(store.getState().stack.errors[0].path, 'processes.api.restart');
    assert.equal(store.getState().managed.length, 0);
    const res = await actions.startStack();
    assert.equal(res.ok, false);
    assert.match(res.error, /config has problems/);
});

test('package.json scripts are offered, and adoptScripts starts (and saves) the chosen ones', async (t) => {
    const dir = project(t, { 'package.json': { name: 'app', scripts: { dev: 'sleep 20', build: 'true' } } });
    const { store, actions } = open(t, dir);
    assert.deepEqual(store.getState().stack.scripts.map((s) => s.name), ['dev', 'build']);
    assert.equal((await actions.adoptScripts(['nope'])).ok, false);

    const res = await actions.adoptScripts(['dev'], { save: true });
    assert.equal(res.ok, true, res.error);
    assert.equal(store.getManaged('dev').status, 'running');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'kestrel.json'), 'utf-8')).processes, { dev: { cmd: 'npm run dev' } });
    assert.equal(store.getState().stack.source, 'kestrel.json');
    assert.equal(store.getState().stack.scripts, null);
});

test('saveAdHoc adds an ad-hoc process to kestrel.json, but not to a Procfile stack', async (t) => {
    const dir = await demoStack(t);
    const { actions } = open(t, dir);
    assert.equal(actions.addAdHoc('extra', 'sleep 20').ok, true);
    const saved = actions.saveAdHoc('extra');
    assert.equal(saved.ok, true, saved.error);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'kestrel.json'), 'utf-8')).processes.extra, { cmd: 'sleep 20' });
    assert.match(actions.saveAdHoc('extra').error, /already in kestrel\.json/);

    const procDir = project(t, { Procfile: 'web: sleep 20\n' });
    const other = open(t, procDir);
    other.actions.addAdHoc('extra', 'sleep 20');
    assert.match(other.actions.saveAdHoc('extra').error, /comes from Procfile/);
});

test('children left by a previous run are found after the first tick and can be stopped', async (t) => {
    const dir = await demoStack(t);
    const leftover = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    t.after(() => isAlive(leftover.pid) && process.kill(-leftover.pid, 'SIGKILL'));
    const startedAt = Date.now();
    fs.mkdirSync(path.join(dir, '.kestrel'));
    fs.writeFileSync(path.join(dir, '.kestrel', 'run.json'), JSON.stringify({
        kestrelPid: 999999,
        children: [
            { id: 'db', pid: leftover.pid, pgid: leftover.pid, startedAt },
            { id: 'worker', pid: process.pid, pgid: process.pid, startedAt: startedAt - 3_600_000 }, // pid reused by someone else
        ],
    }));
    const kestrel = open(t, dir);
    await kestrel.tick();
    assert.deepEqual(kestrel.store.getState().orphans.map((o) => o.pid), [leftover.pid]);

    // The stack waits for the answer: its db would otherwise race the left-over one for the same port.
    let started = false;
    const starting = kestrel.actions.startStack().then((r) => (started = r.ok));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(started, false);
    assert.equal(kestrel.store.getManaged('db').status, 'idle');

    const res = await kestrel.actions.stopOrphans();
    assert.deepEqual(res.data, { stopped: 1 });
    await starting;
    assert.equal(started, true);
    assert.equal(isAlive(leftover.pid), false);
    assert.deepEqual(kestrel.store.getState().orphans, []);
    // The run state now lists this session's children only.
    const recorded = JSON.parse(fs.readFileSync(path.join(dir, '.kestrel', 'run.json'), 'utf-8'));
    assert.equal(recorded.kestrelPid, process.pid);
    assert.ok(!recorded.children.some((c) => c.pid === leftover.pid));
});
