const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../../core/store');
const { createActions, ACTION_NAMES } = require('../../core/actions');

const proc = (pid, extra = {}) => ({
    pid, ppid: 1, name: `p${pid}`, command: `/bin/p${pid}`, user: 'alice', state: 'running', cpu: pid / 100, memMB: 10, startedAt: 0, ...extra,
});

function setup() {
    const store = new Store();
    store.setProcesses([proc(812, { name: 'node' }), proc(99, { name: 'WindowServer', user: '_windowserver' }), proc(1, { ppid: 0, name: 'launchd', user: 'root' }), proc(700)]);
    const calls = [];
    const systemControl = {
        killByPid: (pid, signal) => calls.push(['kill', pid, signal]),
        renice: async (pid, nice) => calls.push(['renice', pid, nice]),
        getNice: (pid) => (pid === 812 ? 5 : null),
    };
    const processManager = {
        spawnManaged: (cmd, opts) => {
            calls.push(['spawn', cmd, opts.id]);
            return { id: opts.id };
        },
        killManaged: async (id) => calls.push(['stop', id]),
        restartManaged: async (id) => {
            calls.push(['restart', id]);
            return { id };
        },
        start: async (id) => {
            calls.push(['start', id]);
            return { id };
        },
        getLogs: (id, opts) => ({ lines: [{ text: `${id}:${opts.filter || ''}` }], total: 1 }),
        getEnv: () => ({ SECRET: 's3cret' }),
    };
    const session = {
        startStack: async (options) => {
            calls.push(['startStack', options]);
            return { started: [], failed: [], blocked: [] };
        },
        stopStack: async () => calls.push(['stopStack']),
        adoptScripts: async (names, options) => calls.push(['adoptScripts', names, options]),
        saveAdHoc: (id) => {
            calls.push(['saveAdHoc', id]);
            if (id === 'nope') throw new Error('This stack comes from Procfile');
            return { path: '/p/kestrel.json' };
        },
        stopOrphans: async () => {
            calls.push(['stopOrphans']);
            return { stopped: 2 };
        },
        dismissOrphans: () => calls.push(['dismissOrphans']),
    };
    const actions = createActions({
        store,
        processManager,
        session,
        systemControl,
        context: { selfPid: 500, parentPid: 499, currentUser: 'alice' },
        onQuit: async () => calls.push(['quit']),
        sampler: { requestPorts: () => calls.push(['ports']) },
    });
    return { store, actions, calls };
}

test('the action set matches the contract (BUILD_PLAN §6.3)', () => {
    const { actions } = setup();
    assert.deepEqual(Object.keys(actions).sort(), [...ACTION_NAMES].sort());
});

test('actions return an envelope and never throw', () => {
    const { actions } = setup();
    assert.deepEqual(actions.setScreen('dashboard'), { ok: true, data: null, error: null });
    const bad = actions.sortBy('bogus');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /sort key/);
    assert.equal(actions.filter(42).ok, false);
    assert.equal(actions.setScreen('nowhere').ok, false);
});

test('sortBy toggles direction when the active key is chosen again', () => {
    const { store, actions } = setup();
    actions.sortBy('cpu');
    assert.equal(store.getState().ui.sortDir, 'asc');
    actions.sortBy('name');
    assert.deepEqual([store.getState().ui.sortBy, store.getState().ui.sortDir], ['name', 'asc']);
});

test('moveSelection is clamped to the visible rows', () => {
    const { store, actions } = setup();
    actions.moveSelection(100);
    assert.equal(store.getState().ui.selectedPid, store.getState().processes.at(-1).pid);
    actions.moveSelection(-100);
    assert.equal(store.getState().ui.selectedPid, store.getState().processes[0].pid);
});

test('focusing the ports box asks the sampler for fresh ports', () => {
    const { store, actions, calls } = setup();
    actions.setFocus('ports');
    assert.equal(store.getState().ui.focus, 'ports');
    assert.deepEqual(calls, [['ports']]);
    actions.setFocus('proc');
    assert.deepEqual(calls, [['ports']], 'only the ports box triggers a refresh');
    assert.equal(actions.setFocus('nowhere').ok, false);
    assert.equal(actions.setMonitorView('ports').ok, false, 'ports is a box now, not a view');
});

test('toggleCollapse adds and removes a pid', () => {
    const { store, actions } = setup();
    actions.toggleCollapse(812);
    assert.deepEqual(store.getState().ui.collapsedPids, [812]);
    actions.toggleCollapse(812);
    assert.deepEqual(store.getState().ui.collapsedPids, []);
});

test('describeProcess returns the process, its parent chain and nice value, even when filtered out', () => {
    const { store, actions } = setup();
    store.setProcesses([
        { ...proc(1, { ppid: 0, name: 'launchd', user: 'root' }) },
        { ...proc(300, { ppid: 1, name: 'Terminal' }) },
        { ...proc(301, { ppid: 300, name: 'zsh' }) },
        { ...proc(812, { ppid: 301, name: 'node' }) },
    ]);
    actions.filter('launchd'); // node is not visible any more
    const { data } = actions.describeProcess(812);
    assert.equal(data.process.name, 'node');
    assert.deepEqual(data.parents.map((p) => p.name), ['launchd', 'Terminal', 'zsh']);
    assert.equal(data.nice, 5);
    assert.match(actions.describeProcess(4242).error, /no longer running/);
});

test('describeProcess stops at cycles and missing parents', () => {
    const { store, actions } = setup();
    store.setProcesses([proc(10, { ppid: 11 }), proc(11, { ppid: 10 })]);
    assert.deepEqual(actions.describeProcess(10).data.parents.map((p) => p.pid), [11]);
});

test('classifyTarget reports the safety tier', () => {
    const { actions } = setup();
    assert.equal(actions.classifyTarget(812).data.tier, 'own');
    assert.equal(actions.classifyTarget(99).data.tier, 'system');
    assert.equal(actions.classifyTarget(1).data.tier, 'blocked');
    assert.equal(actions.classifyTarget(500).data.tier, 'blocked');
});

test('kill is refused without the right confirmation, even if the UI forgets to ask', () => {
    const { actions, calls } = setup();
    const refused = actions.kill(812, 'SIGTERM');
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'ECONFIRM');
    assert.deepEqual(calls, []);

    assert.equal(actions.kill(812, 'SIGTERM', { tier: 'own' }).ok, true);
    assert.deepEqual(calls, [['kill', 812, 'SIGTERM']]);
});

test('system processes need the name typed; protected ones can never be killed', () => {
    const { actions, calls } = setup();
    assert.equal(actions.kill(99, 'SIGKILL', { tier: 'system', typedName: 'windowserver' }).ok, false);
    assert.equal(actions.kill(99, 'SIGKILL', { tier: 'system', typedName: 'WindowServer' }).ok, true);
    const blocked = actions.kill(1, 'SIGTERM', { tier: 'blocked' });
    assert.equal(blocked.code, 'EBLOCKED');
    assert.match(blocked.error, /protected/);
    assert.deepEqual(calls, [['kill', 99, 'SIGKILL']]);
});

test('processes in a managed tree are classified as managed', () => {
    const { store, actions } = setup();
    store.upsertManaged({ id: 'api', pid: 812 });
    assert.equal(actions.classifyTarget(812).data.tier, 'managed');
    assert.equal(actions.kill(812, 'SIGTERM', { tier: 'own' }).code, 'ECONFIRM');
});

test('renice goes through the same policy', async () => {
    const { actions, calls } = setup();
    assert.equal((await actions.renice(812, 5)).code, 'ECONFIRM');
    assert.equal((await actions.renice(812, 5, { tier: 'own' })).ok, true);
    assert.deepEqual(calls, [['renice', 812, 5]]);
});

test('killPort resolves the listener owner, and explains hidden owners', () => {
    const { store, actions, calls } = setup();
    store.setPorts({ items: [{ port: 3000, address: '*', proto: 'tcp', pid: 812, name: 'node' }, { port: 22, address: '*', proto: 'tcp', pid: null, name: null }], partial: true });
    assert.equal(actions.killPort(3000, { tier: 'own', pid: 812 }).ok, true);
    assert.deepEqual(calls, [['kill', 812, 'SIGTERM']]);
    assert.match(actions.killPort(22, { tier: 'own', pid: 1 }).error, /sudo/);
    assert.match(actions.killPort(9999, { tier: 'own', pid: 812 }).error, /Nothing is listening/);
});

test('managed-process actions delegate to the process manager', async () => {
    const { actions, calls } = setup();
    assert.equal(actions.addAdHoc('web', 'npm start').ok, true);
    await actions.stop('web');
    await actions.restart('web');
    await actions.start('web');
    assert.deepEqual(calls, [['spawn', 'npm start', 'web'], ['stop', 'web'], ['restart', 'web'], ['start', 'web']]);
});

test('stack actions delegate to the stack session and report its errors', async () => {
    const { actions, calls } = setup();
    assert.equal((await actions.startStack({ only: ['api'] })).ok, true);
    await actions.stopStack();
    await actions.adoptScripts(['dev'], { save: true });
    assert.deepEqual(actions.saveAdHoc('web').data, { path: '/p/kestrel.json' });
    assert.match(actions.saveAdHoc('nope').error, /comes from Procfile/);
    assert.deepEqual((await actions.stopOrphans()).data, { stopped: 2 });
    actions.dismissOrphans();
    assert.deepEqual(calls.map((c) => c[0]), ['startStack', 'stopStack', 'adoptScripts', 'saveAdHoc', 'saveAdHoc', 'stopOrphans', 'dismissOrphans']);
    assert.deepEqual(calls[0][1], { only: ['api'] });
});

test('logs, env and quit', async () => {
    const { store, actions, calls } = setup();
    assert.equal(actions.getLogs('api', { filter: 'err' }).data.lines[0].text, 'api:err');
    assert.deepEqual(actions.revealEnv('api').data, { SECRET: 's3cret' });
    actions.setLogFilter('boom');
    actions.setLogFollow(false);
    actions.selectManaged('api');
    assert.deepEqual([store.getState().ui.logFilter, store.getState().ui.logFollow, store.getState().ui.selectedManagedId], ['boom', false, 'api']);
    store.setToast('warn', 'x');
    actions.dismissToast();
    assert.equal(store.getState().ui.toast, null);
    assert.equal((await actions.quit()).ok, true);
    assert.deepEqual(calls.at(-1), ['quit']);
    assert.equal(actions.setLogFollow('yes').ok, false);
});

test('notify shows a toast, and rejects unknown levels', () => {
    const { store, actions } = setup();
    assert.equal(actions.notify('ok', 'Sent SIGTERM to node (812)').ok, true);
    assert.deepEqual([store.getState().ui.toast.level, store.getState().ui.toast.message], ['ok', 'Sent SIGTERM to node (812)']);
    assert.equal(actions.notify('shout', 'x').ok, false);
    assert.equal(actions.notify('info', 42).ok, false);
});

test('killPort refuses when the process on the port is not the one that was confirmed (review finding)', () => {
    const { store, actions, calls } = setup();
    // The user confirmed killing node (812) on :3000 …
    const token = { tier: 'own', pid: 812 };
    // … but before they pressed y, node restarted and pid 700 now owns the port.
    store.setPorts({ items: [{ port: 3000, address: '*', proto: 'tcp', pid: 700, name: 'p700' }], partial: false });
    const result = actions.killPort(3000, token);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ECHANGED');
    assert.match(result.error, /changed/);
    assert.equal(actions.killPort(3000, { tier: 'own' }).code, 'ECHANGED', 'a token without a pid is never enough');
    assert.deepEqual(calls, []);
});
