const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../../core/store');
const { HISTORY_CAPACITY, MANAGED_MEM_CAPACITY } = require('../../core/store/state');

const proc = (pid, ppid, extra = {}) => ({
    pid, ppid, name: `p${pid}`, command: `/bin/p${pid}`, user: 'alice', state: 'running', cpu: 0, memMB: 10, startedAt: 0, ...extra,
});
const system = (extra = {}) => ({ cpuPercent: 40, cores: [40], load: [1, 1, 1], memUsedMB: 500, memTotalMB: 1000, swapUsedMB: 0, uptimeSec: 1, ...extra });

function recordEvents(store, names) {
    const seen = [];
    for (const n of names) store.on(n, (payload) => seen.push([n, payload]));
    return seen;
}

test('initial state matches the contract defaults', () => {
    const state = new Store({ meta: { version: '0.1.0' } }).getState();
    assert.equal(state.meta.version, '0.1.0');
    assert.equal(state.system.cpuPercent, null, 'sampling… until the first real tick');
    assert.equal(state.ui.screen, 'dashboard');
    assert.deepEqual(state.settings.thresholds, { cpu: [50, 80], memMB: [500, 1500] });
});

test('setSystem replaces state immutably, records history and emits', () => {
    const store = new Store();
    const events = recordEvents(store, ['change', 'stats:update']);
    const before = store.getState();
    store.setSystem(system());
    const after = store.getState();
    assert.notEqual(after, before);
    assert.notEqual(after.system, before.system);
    assert.deepEqual(after.history, { cpu: [40], mem: [50] });
    assert.deepEqual(events.map(([n]) => n), ['change', 'stats:update']);
});

test('history skips unknown values and is capped', () => {
    const store = new Store();
    store.setSystem(system({ cpuPercent: null, memUsedMB: null }));
    assert.deepEqual(store.getState().history, { cpu: [], mem: [] });
    for (let i = 0; i < HISTORY_CAPACITY + 5; i++) store.setSystem(system({ cpuPercent: i }));
    assert.equal(store.getState().history.cpu.length, HISTORY_CAPACITY);
    assert.equal(store.getState().history.cpu.at(-1), HISTORY_CAPACITY + 4);
});

test('setProcesses publishes a derived, tagged view and reconciles the selection', () => {
    const store = new Store();
    store.setProcesses([proc(1, 0, { cpu: 1 }), proc(2, 1, { cpu: 90 })]);
    const { processes, ui } = store.getState();
    assert.deepEqual(processes.map((p) => p.pid), [2, 1]);
    assert.equal(processes[0].level, 'danger');
    assert.equal(ui.selectedPid, 2);
});

test('topConsumers is the top 5 by CPU and ignores the Monitor filter', () => {
    const store = new Store();
    store.setProcesses([1, 2, 3, 4, 5, 6, 7].map((pid) => proc(pid, 0, { cpu: pid * 10, name: pid === 7 ? 'hot' : `p${pid}` })));
    store.updateUi({ filterQuery: 'p1', sortBy: 'pid', sortDir: 'asc' });
    const { topConsumers, processes } = store.getState();
    assert.deepEqual(topConsumers.map((p) => p.pid), [7, 6, 5, 4, 3]);
    assert.equal(topConsumers[0].level, 'warn', '70% is between the 50/80 thresholds');
    assert.deepEqual(processes.map((p) => p.pid), [1]);
});

test('updateUi validates input and re-derives the view', () => {
    const store = new Store();
    store.setProcesses([proc(1, 0, { name: 'zsh' }), proc(2, 1, { name: 'node' })]);
    store.updateUi({ filterQuery: 'node' });
    assert.deepEqual(store.getState().processes.map((p) => p.pid), [2]);
    assert.throws(() => store.updateUi({ sortBy: 'bogus' }), /sort key/);
    assert.throws(() => store.updateUi({ screen: 'nope' }), /screen/);
    assert.throws(() => store.updateUi({ monitorView: 'ports' }), /view/);
    assert.throws(() => store.updateUi({ focus: 'nope' }), /focus/);
    assert.throws(() => store.updateUi({ filterQuery: 5 }), /filter/);
});

test('prefersFastPorts is true only while the ports box is focused', () => {
    const store = new Store();
    assert.equal(store.prefersFastPorts(), false);
    store.updateUi({ focus: 'ports' });
    assert.equal(store.prefersFastPorts(), true);
});

test('history keeps 240 samples: 4 minutes of graph at the default 1 s refresh', () => {
    assert.equal(HISTORY_CAPACITY, 240);
});

test('setPorts tags listeners that belong to managed processes', () => {
    const store = new Store();
    store.upsertManaged({ id: 'api', pid: 10 });
    store.setProcesses([proc(10, 1), proc(11, 10)]);
    store.setPorts({ items: [{ port: 3000, address: '*', proto: 'tcp', pid: 11, name: 'node' }], partial: true });
    const { ports } = store.getState();
    assert.equal(ports.items[0].managedId, 'api');
    assert.equal(ports.partial, true);
    assert.equal(typeof ports.updatedAt, 'number');
});

test('errors are tracked per source and cleared without redundant commits', () => {
    const store = new Store();
    let changes = 0;
    store.on('change', () => changes++);
    store.reportError('ports', new Error('ss not found'));
    assert.equal(store.getState().errors.ports.message, 'ss not found');
    store.clearError('ports');
    store.clearError('ports');
    assert.equal(store.getState().errors.ports, undefined);
    assert.equal(changes, 2, 'clearing an absent error does not commit');
});

test('managed entries get defaults, resources and removal', () => {
    const store = new Store();
    store.upsertManaged({ id: 'api', pid: 10, status: 'running' });
    store.setProcesses([proc(10, 1, { cpu: 5, memMB: 100 }), proc(11, 10, { cpu: 5, memMB: 50 })]);
    const api = store.getManaged('api');
    assert.deepEqual(api.resources, { cpu: 10, memMB: 150, procCount: 2 });
    assert.deepEqual(api.memHistory, []);
    assert.equal(api.leakSuspect, false);
    store.removeManaged('api');
    assert.equal(store.getManaged('api'), null);
});

test('sampleManagedMemory records history and raises and clears a leak alert', () => {
    const store = new Store();
    store.upsertManaged({ id: 'api', pid: 10 });
    const events = recordEvents(store, ['alert']);
    for (let i = 0; i < MANAGED_MEM_CAPACITY; i++) {
        store.setProcesses([proc(10, 1, { memMB: 200 + i * 0.5 })]);
        store.sampleManagedMemory(i * 5000);
    }
    assert.equal(store.getManaged('api').memHistory.length, MANAGED_MEM_CAPACITY);
    assert.equal(store.getManaged('api').leakSuspect, true);
    assert.equal(store.getState().alerts[0].id, 'leak:api');
    assert.equal(events.length, 1);

    // Memory stabilises: the flag holds for 60 s, then clears together with the alert.
    const flatUntil = MANAGED_MEM_CAPACITY + 200;
    for (let i = MANAGED_MEM_CAPACITY; i < flatUntil; i++) {
        store.setProcesses([proc(10, 1, { memMB: 300 })]);
        store.sampleManagedMemory(i * 5000);
    }
    assert.equal(store.getManaged('api').leakSuspect, false);
    assert.equal(store.getState().alerts.length, 0);
});

test('toasts and alerts can be set and dismissed', () => {
    const store = new Store();
    store.setToast('danger', 'renice failed · needs sudo');
    assert.equal(store.getState().ui.toast.level, 'danger');
    store.dismissToast();
    assert.equal(store.getState().ui.toast, null);
    store.addAlert({ id: 'x', level: 'warn', source: 'test', message: 'hi' });
    store.addAlert({ id: 'x', level: 'warn', source: 'test', message: 'hi again' });
    assert.equal(store.getState().alerts.length, 1, 'alerts are de-duplicated by id');
    store.dismissAlert('x');
    assert.equal(store.getState().alerts.length, 0);
});

test('setThresholds re-derives levels', () => {
    const store = new Store();
    store.setProcesses([proc(1, 0, { cpu: 30 })]);
    assert.equal(store.getState().processes[0].level, 'ok');
    store.setThresholds({ cpu: [20, 90], memMB: [500, 1500] });
    assert.equal(store.getState().processes[0].level, 'warn');
});

test('setMeta merges metadata', () => {
    const store = new Store();
    store.setMeta({ configSource: 'Procfile' });
    assert.equal(store.getState().meta.configSource, 'Procfile');
});
