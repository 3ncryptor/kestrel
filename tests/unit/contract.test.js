// Freezes the store/actions contract (BUILD_PLAN §6). If this test fails, the change to the contract
// must be deliberate: update BUILD_PLAN §6, core/store/types.js and this snapshot together.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createInitialState, createManagedEntry, STORE_EVENTS } = require('../../core/store/state');
const { ACTION_NAMES } = require('../../core/actions');

const keys = (obj) => Object.keys(obj).sort();

test('state slices', () => {
    const state = createInitialState();
    assert.deepEqual(keys(state), [
        'alerts', 'errors', 'history', 'managed', 'meta', 'orphans', 'ports', 'processes', 'settings', 'stack', 'system', 'topConsumers', 'ui',
    ]);
    assert.deepEqual(keys(state.stack), ['errors', 'name', 'path', 'phase', 'scripts', 'source', 'stopProgress', 'warnings']);
    assert.deepEqual(keys(state.meta), ['arch', 'configPath', 'configSource', 'hostname', 'isRoot', 'platform', 'startedAt', 'version']);
    assert.deepEqual(keys(state.system), ['cores', 'cpuPercent', 'load', 'memCachedMB', 'memTotalMB', 'memUsedMB', 'swapTotalMB', 'swapUsedMB', 'uptimeSec']);
    assert.deepEqual(keys(state.history), ['cpu', 'mem']);
    assert.deepEqual(keys(state.ports), ['items', 'partial', 'updatedAt']);
    assert.deepEqual(keys(state.ui), [
        'collapsedPids', 'filterQuery', 'focus', 'logFilter', 'logFollow', 'monitorView', 'screen',
        'selectedManagedId', 'selectedPid', 'sortBy', 'sortDir', 'toast',
    ]);
});

test('managed entry fields', () => {
    assert.deepEqual(keys(createManagedEntry({ id: 'x' })), [
        'blockedBy', 'cmd', 'cwd', 'dependsOn', 'exitCode', 'id', 'leakSuspect', 'logCount', 'memHistory', 'nextRestartAt',
        'pid', 'ready', 'resources', 'restart', 'restartCount', 'signal', 'startedAt', 'status',
    ]);
});

test('store events', () => {
    assert.deepEqual([...STORE_EVENTS].sort(), [
        'alert', 'change', 'collector:error', 'managed:crashed', 'managed:killed', 'managed:log', 'managed:ready',
        'managed:restarting', 'managed:started', 'managed:status', 'ports:update', 'processes:update', 'stats:update', 'ui:update',
    ]);
});

test('actions', () => {
    assert.deepEqual([...ACTION_NAMES].sort(), [
        'addAdHoc', 'adoptScripts', 'classifyTarget', 'describeProcess', 'dismissOrphans', 'dismissToast', 'filter', 'getLogs',
        'kill', 'killPort', 'moveSelection', 'notify', 'quit', 'renice', 'restart', 'revealEnv', 'saveAdHoc', 'select',
        'selectManaged', 'setFocus', 'setLogFilter', 'setLogFollow', 'setMonitorView', 'setScreen', 'sortBy', 'start',
        'startStack', 'stop', 'stopOrphans', 'stopStack', 'toggleCollapse',
    ]);
});

test('dashboard defaults (M2b)', () => {
    const { ui } = createInitialState();
    assert.deepEqual([ui.screen, ui.monitorView, ui.focus], ['dashboard', 'table', 'proc']);
});
