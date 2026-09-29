const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { Store } = require('../../core/store');
const { ProcessManager, deriveId } = require('../../core/processManager');
const { computeDelay } = require('../../core/processManager/backoff');
const { isAlive } = require('../../core/systemControl');

const WORKER = path.join(__dirname, '..', '..', 'scripts', 'dummy-worker.js');
const worker = (args) => `"${process.execPath}" "${WORKER}" ${args}`;

// Tiny backoff so restart tests finish quickly while keeping the same growth curve.
const fastDelay = (attempt) => computeDelay(attempt, { base: 20, max: 80 });

// Always tears the manager down, even when an assertion fails, so crash loops never leak.
function setup(t, opts = {}) {
    const store = new Store();
    const pm = new ProcessManager({ store, computeDelay: fastDelay, killGraceMs: 500, ...opts });
    t.after(() => pm.shutdown());
    return { store, pm };
}

test('deriveId prefers the script name over the interpreter', () => {
    assert.equal(deriveId('node scripts/dummy-worker.js'), 'dummy-worker');
    assert.equal(deriveId('sleep 10'), 'sleep');
    assert.equal(deriveId('npm run dev'), 'npm');
});

test('spawn emits managed:started, streams structured log lines and counts them', async (t) => {
    const { store, pm } = setup(t);
    const started = once(store, 'managed:started');
    const logs = [];
    store.on('managed:log', (e) => logs.push(e));

    pm.spawnManaged(worker('--interval 20 --crash-after 10000'), { id: 'w1' });
    const [meta] = await started;
    assert.equal(meta.id, 'w1');
    assert.equal(meta.status, 'running');
    assert.ok(meta.pid > 0);

    while (logs.length < 2) await once(store, 'managed:log');
    assert.ok(logs.every((l) => l.id === 'w1' && typeof l.line.text === 'string' && l.line.stream === 'stdout'));
    // The count reaches the store batched (see the next test).
    while (store.getManaged('w1').logCount < 2) await once(store, 'change');
    assert.equal('logs' in store.getManaged('w1'), false, 'log lines are not kept in state');
});

test('log-only updates reach the store batched, however chatty the process (M3 perf)', async (t) => {
    const { store, pm } = setup(t);
    let logOnlyCommits = 0;
    const upsert = store.upsertManaged.bind(store);
    store.upsertManaged = (entry) => {
        if (Object.keys(entry).every((k) => k === 'id' || k === 'logCount')) logOnlyCommits += 1;
        upsert(entry);
    };
    let lines = 0;
    store.on('managed:log', () => (lines += 1));
    pm.spawnManaged(`"${process.execPath}" "${path.join(__dirname, '..', '..', 'scripts', 'fixture-server.js')}" --tick 1`, { id: 'chatty' });
    await new Promise((r) => setTimeout(r, 700));
    assert.ok(lines >= 100, `the process was chatty (${lines} lines)`);
    assert.ok(logOnlyCommits <= 5, `${logOnlyCommits} log-only commits for ${lines} lines`);
    const seen = lines;
    await new Promise((r) => setTimeout(r, 300)); // one more batch window
    assert.ok(store.getManaged('chatty').logCount >= seen, 'the count catches up within one batch');
});

test('getLogs returns the newest lines with an optional filter', async (t) => {
    const { store, pm } = setup(t);
    pm.spawnManaged(worker('--interval 10 --crash-after 10000 --stderr'), { id: 'logs' });
    while (store.getManaged('logs').logCount < 6) await once(store, 'managed:log');

    const all = pm.getLogs('logs', { limit: 3 });
    assert.equal(all.lines.length, 3);
    const errOnly = pm.getLogs('logs', { filter: 'tick 2' });
    assert.ok(errOnly.lines.every((l) => l.text.includes('tick 2')));
    assert.throws(() => pm.getLogs('nope'), /No managed process named "nope"/);
});

test('status transitions are published as managed:status events', async (t) => {
    const { store, pm } = setup(t);
    const transitions = [];
    store.on('managed:status', (e) => transitions.push(`${e.from}->${e.to}`));
    pm.spawnManaged('sleep 20', { id: 's' });
    await pm.killManaged('s');
    assert.deepEqual(transitions, ['idle->running', 'running->stopping', 'stopping->stopped']);
});

test('a crash emits managed:crashed then managed:restarting and respawns with a new pid', async (t) => {
    const { store, pm } = setup(t);
    const crashed = once(store, 'managed:crashed');
    const restarting = once(store, 'managed:restarting');
    pm.spawnManaged(worker('--interval 1000 --crash-after 50 --exit-code 3'), { id: 'crashy' });
    const firstPid = store.getManaged('crashy').pid;

    const [crash] = await crashed;
    assert.deepEqual(crash, { id: 'crashy', exitCode: 3, signal: null });

    const [restart] = await restarting;
    assert.deepEqual(restart, { id: 'crashy', attempt: 1, delayMs: 20 });
    assert.equal(store.getManaged('crashy').status, 'restarting');

    const [again] = await once(store, 'managed:started');
    assert.notEqual(again.pid, firstPid);
    assert.equal(again.restartCount, 1);
});

test('restart delays follow the exponential backoff schedule', async (t) => {
    const { store, pm } = setup(t);
    const delays = [];
    store.on('managed:restarting', (e) => delays.push(e.delayMs));
    pm.spawnManaged(worker('--interval 1000 --crash-after 10'), { id: 'loop' });
    while (delays.length < 4) await once(store, 'managed:restarting');
    assert.deepEqual(delays.slice(0, 4), [20, 40, 80, 80]);
});

test('a clean exit (code 0) is not restarted', async (t) => {
    const { store, pm } = setup(t);
    let restarts = 0;
    store.on('managed:restarting', () => restarts++);
    pm.spawnManaged(worker('--interval 1000 --crash-after 30 --exit-code 0'), { id: 'clean' });
    while (store.getManaged('clean').status !== 'exited') await once(store, 'change');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(restarts, 0);
    assert.equal(store.getManaged('clean').exitCode, 0);
});

test('killManaged stops the process, emits managed:killed and prevents restart', async (t) => {
    const { store, pm } = setup(t);
    pm.spawnManaged(worker('--interval 20 --crash-after 10000'), { id: 'victim' });
    const { pid } = store.getManaged('victim');
    const killed = once(store, 'managed:killed');

    await pm.killManaged('victim');
    assert.deepEqual((await killed)[0], { id: 'victim' });
    assert.equal(store.getManaged('victim').status, 'stopped');
    assert.equal(isAlive(pid), false);

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(store.getManaged('victim').status, 'stopped');
});

test('killManaged also stops grandchildren in the process group', async (t) => {
    const { store, pm } = setup(t);
    // The shell spawns a child `sleep`; killing the group must take both down.
    pm.spawnManaged('sleep 30 & wait', { id: 'group' });
    await new Promise((r) => setTimeout(r, 150));
    const { pid } = store.getManaged('group');
    await pm.killManaged('group');
    assert.throws(() => process.kill(-pid, 0), /ESRCH/, 'the whole process group is gone');
});

test('killManaged during the backoff window cancels the pending restart', async (t) => {
    const { store, pm } = setup(t, { computeDelay: () => 5000 });
    const restarting = once(store, 'managed:restarting');
    pm.spawnManaged(worker('--interval 1000 --crash-after 10'), { id: 'pending' });
    await restarting;
    await pm.killManaged('pending');
    assert.equal(store.getManaged('pending').status, 'stopped');
});

test('restartManaged and removeManaged manage the full lifecycle', async (t) => {
    const { store, pm } = setup(t);
    pm.spawnManaged(worker('--interval 1000 --crash-after 10000'), { id: 'cycle' });
    const firstPid = store.getManaged('cycle').pid;

    const restarted = await pm.restartManaged('cycle');
    assert.notEqual(restarted.pid, firstPid);
    assert.equal(restarted.status, 'running');

    await pm.removeManaged('cycle');
    assert.equal(store.getManaged('cycle'), null);
});

test('spawnManaged validates input and rejects duplicate ids', (t) => {
    const { pm } = setup(t);
    assert.throws(() => pm.spawnManaged('   '), /non-empty/);
    assert.throws(() => pm.spawnManaged('sleep 1', { id: 'bad id!' }), /Invalid name/);
    pm.spawnManaged('sleep 5', { id: 'dup' });
    assert.throws(() => pm.spawnManaged('sleep 5', { id: 'dup' }), /already exists/);
    assert.equal(pm.spawnManaged('sleep 5').id, 'sleep');
    assert.equal(pm.spawnManaged('sleep 5').id, 'sleep-2');
});

test('env and cwd are passed to the child', async (t) => {
    const { store, pm } = setup(t);
    const lines = [];
    store.on('managed:log', (e) => lines.push(e.line.text));
    pm.spawnManaged('echo "$KESTREL_TEST_VAR in $(pwd)"', { id: 'env', env: { KESTREL_TEST_VAR: 'hello' }, cwd: '/tmp' });
    while (store.getManaged('env').status !== 'exited') await once(store, 'change');
    assert.ok(lines.some((l) => /^hello in (\/private)?\/tmp$/.test(l)), lines.join('|'));
});

test('output written just before a crash is logged before the crash is recorded', async (t) => {
    // Regression: on Linux the child's "exit" event can arrive before its last stdout chunk.
    const { store, pm } = setup(t, { autoRestart: false });
    const lines = [];
    store.on('managed:log', (e) => lines.push(e.line.text));
    const crashed = once(store, 'managed:crashed');
    pm.spawnManaged('echo "last words"; exit 3', { id: 'dying' });
    await crashed;
    const last = lines.indexOf('last words');
    const crash = lines.findIndex((l) => l.startsWith('[kestrel] crashed'));
    assert.ok(last !== -1, `final output was captured: ${lines.join(' | ')}`);
    assert.ok(last < crash, 'final output comes before the crash line');
});

test('a background grandchild holding stdout open does not delay exit detection forever', async (t) => {
    const { store, pm } = setup(t, { autoRestart: false });
    // `sleep` inherits the pipe and outlives the shell, so "close" would never fire on its own.
    pm.spawnManaged('(sleep 30 &) ; exit 4', { id: 'leaky' });
    const [crash] = await once(store, 'managed:crashed');
    assert.equal(crash.exitCode, 4);
});

const groupAlive = (pgid) => {
    try {
        process.kill(-pgid, 0);
        return true;
    } catch {
        return false;
    }
};

test('leftover background processes are cleaned up when the main process exits', async (t) => {
    // Regression: once the shell exited, its backgrounded `sleep` was orphaned and unreachable.
    const { store, pm } = setup(t, { autoRestart: false });
    pm.spawnManaged('(sleep 30 &) ; sleep 0.2; exit 4', { id: 'orphans' });
    const { pid } = store.getManaged('orphans');
    await once(store, 'managed:crashed');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(groupAlive(pid), false, 'no process from the group survives');
});

test('stop and shutdownSync reach the process group even after the main process is gone', async (t) => {
    const { store, pm } = setup(t, { autoRestart: false, stdioDrainMs: 5000 });
    // Main process exits at once; the grandchild keeps stdout open, so the entry is still finalizing.
    pm.spawnManaged('(sleep 30 &) ; exit 0', { id: 'late' });
    const { pid } = store.getManaged('late');
    await new Promise((r) => setTimeout(r, 200));
    pm.shutdownSync();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(groupAlive(pid), false);
});

test('an unknown command crashes (exit 127) and is scheduled for restart', async (t) => {
    const { store, pm } = setup(t);
    const crashed = once(store, 'managed:crashed');
    pm.spawnManaged('definitely-not-a-real-command-xyz', { id: 'missing' });
    const [crash] = await crashed;
    assert.equal(crash.exitCode, 127);
});

test('concurrent restarts leave exactly one live, tracked child', async (t) => {
    const { store, pm } = setup(t);
    const pids = [];
    store.on('managed:started', (m) => pids.push(m.pid));
    pm.spawnManaged('sleep 20', { id: 'race' });
    await Promise.all([pm.restartManaged('race'), pm.restartManaged('race')]);
    const tracked = store.getManaged('race').pid;
    assert.deepEqual(pids.filter((pid) => isAlive(pid)), [tracked]);
});

test('restart racing a remove fails with a clear error, not a TypeError', async (t) => {
    const { store, pm } = setup(t);
    pm.spawnManaged('sleep 20', { id: 'gone' });
    const [removed, restarted] = await Promise.allSettled([pm.removeManaged('gone'), pm.restartManaged('gone')]);
    assert.equal(removed.status, 'fulfilled');
    assert.equal(restarted.status, 'rejected');
    assert.match(restarted.reason.message, /No managed process named "gone"/);
    assert.equal(store.getManaged('gone'), null);
});

test('shutdownSync signals every child without waiting', async (t) => {
    const { store, pm } = setup(t);
    pm.spawnManaged('sleep 20', { id: 'a' });
    const { pid } = store.getManaged('a');
    pm.shutdownSync();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(isAlive(pid), false);
});
