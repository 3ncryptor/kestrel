const { test } = require('node:test');
const assert = require('node:assert/strict');
const sel = require('../../core/store/selectors');

const proc = (pid, ppid, extra = {}) => ({
    pid, ppid, name: `p${pid}`, command: `/bin/p${pid}`, user: 'alice', state: 'running', cpu: 0, memMB: 10, startedAt: 0, ...extra,
});

// A small tree:  1 ─┬─ 10 ─┬─ 11
//                   │      └─ 12
//                   └─ 20
const TREE = [proc(1, 0), proc(10, 1, { cpu: 5 }), proc(11, 10, { cpu: 30 }), proc(12, 10, { cpu: 1 }), proc(20, 1, { cpu: 50 })];

test('applyView filters by name, command or pid and sorts with a stable pid tie-break', () => {
    const rows = [proc(3, 1, { name: 'node', cpu: 5 }), proc(2, 1, { name: 'node', cpu: 5 }), proc(4, 1, { name: 'zsh', cpu: 9 })];
    assert.deepEqual(sel.applyView(rows, { sortBy: 'cpu', sortDir: 'desc', filterQuery: '' }).map((p) => p.pid), [4, 2, 3]);
    assert.deepEqual(sel.applyView(rows, { sortBy: 'cpu', sortDir: 'desc', filterQuery: 'NODE' }).map((p) => p.pid), [2, 3]);
    assert.deepEqual(sel.applyView(rows, { sortBy: 'name', sortDir: 'asc', filterQuery: '' }).map((p) => p.pid), [2, 3, 4]);
    assert.deepEqual(sel.applyView(rows, { sortBy: 'pid', sortDir: 'asc', filterQuery: '4' }).map((p) => p.pid), [4]);
    assert.deepEqual(sel.applyView(rows, { sortBy: 'mem', sortDir: 'desc', filterQuery: '' }).length, 3, '"mem" sorts by memMB');
});

test('applyView never mutates its input', () => {
    const rows = [proc(2, 1, { cpu: 1 }), proc(1, 0, { cpu: 9 })];
    const before = rows.map((p) => p.pid);
    sel.applyView(rows, { sortBy: 'cpu', sortDir: 'desc', filterQuery: '' });
    assert.deepEqual(rows.map((p) => p.pid), before);
});

test('reconcileSelection keeps a visible selection and falls back to the first row', () => {
    const rows = [proc(5, 1), proc(6, 1)];
    assert.equal(sel.reconcileSelection(rows, 6), 6);
    assert.equal(sel.reconcileSelection(rows, 99), 5);
    assert.equal(sel.reconcileSelection([], 6), null);
});

test('thresholdLevel and processLevel classify values against [warn, danger]', () => {
    assert.equal(sel.thresholdLevel(10, [50, 80]), 'ok');
    assert.equal(sel.thresholdLevel(50, [50, 80]), 'warn');
    assert.equal(sel.thresholdLevel(95, [50, 80]), 'danger');
    const thresholds = { cpu: [50, 80], memMB: [500, 1500] };
    assert.equal(sel.processLevel(proc(1, 0, { cpu: 10, memMB: 2000 }), thresholds), 'danger', 'worst dimension wins');
    assert.equal(sel.processLevel(proc(1, 0, { cpu: 60, memMB: 10 }), thresholds), 'warn');
});

test('linkManaged sums cpu/mem over each managed process tree and tags members', () => {
    const managed = [{ id: 'api', pid: 10 }, { id: 'idle', pid: null }];
    const { byPid, resources } = sel.linkManaged(TREE, managed);
    assert.deepEqual(resources.get('api'), { cpu: 36, memMB: 30, procCount: 3 });
    assert.equal(resources.has('idle'), false);
    assert.equal(byPid.get(11), 'api');
    assert.equal(byPid.get(20), undefined);
});

test('linkManaged ignores managed pids that are not in the snapshot', () => {
    const { resources } = sel.linkManaged(TREE, [{ id: 'gone', pid: 999 }]);
    assert.equal(resources.has('gone'), false);
});

test('buildTree orders depth-first with siblings sorted, and marks structure', () => {
    const rows = sel.buildTree(TREE, { sortBy: 'cpu', sortDir: 'desc', filterQuery: '', collapsedPids: [] });
    assert.deepEqual(rows.map((r) => [r.pid, r.depth]), [[1, 0], [20, 1], [10, 1], [11, 2], [12, 2]]);
    const ten = rows.find((r) => r.pid === 10);
    assert.equal(ten.hasChildren, true);
    assert.equal(ten.collapsed, false);
});

test('buildTree hides the descendants of collapsed nodes', () => {
    const rows = sel.buildTree(TREE, { sortBy: 'pid', sortDir: 'asc', filterQuery: '', collapsedPids: [10] });
    assert.deepEqual(rows.map((r) => r.pid), [1, 10, 20]);
    assert.equal(rows.find((r) => r.pid === 10).collapsed, true);
    assert.equal(rows.find((r) => r.pid === 10).descendantCount, 2);
});

test('buildTree with a filter keeps matches plus their ancestors', () => {
    const rows = sel.buildTree(TREE, { sortBy: 'pid', sortDir: 'asc', filterQuery: 'p12', collapsedPids: [] });
    assert.deepEqual(rows.map((r) => r.pid), [1, 10, 12]);
});

test('buildTree treats processes with unknown parents as roots (no infinite loops)', () => {
    const orphanCycle = [proc(1, 1), proc(5, 42)];
    const rows = sel.buildTree(orphanCycle, { sortBy: 'pid', sortDir: 'asc', filterQuery: '', collapsedPids: [] });
    assert.deepEqual(rows.map((r) => r.pid), [1, 5]);
});

test('deriveProcessRows tags managedId and level, in table and tree views', () => {
    const managed = [{ id: 'api', pid: 10 }];
    const thresholds = { cpu: [25, 45], memMB: [500, 1500] };
    const ui = { monitorView: 'table', sortBy: 'cpu', sortDir: 'desc', filterQuery: '', collapsedPids: [] };
    const table = sel.deriveProcessRows(TREE, managed, ui, thresholds);
    assert.deepEqual(table.rows.map((r) => r.pid), [20, 11, 10, 12, 1]);
    assert.equal(table.rows.find((r) => r.pid === 11).managedId, 'api');
    assert.equal(table.rows.find((r) => r.pid === 20).level, 'danger');
    assert.equal(table.rows.find((r) => r.pid === 11).level, 'warn');
    assert.equal(table.rows.find((r) => r.pid === 1).managedId, null);

    const tree = sel.deriveProcessRows(TREE, managed, { ...ui, monitorView: 'tree' }, thresholds);
    assert.equal(tree.rows[0].depth, 0);
    assert.equal(table.resources.get('api').procCount, 3);
});

// ---------- M4 performance (exact same results, less work) ----------

test('topBy returns exactly what a full sort would, ties included', () => {
    const { topBy, comparator } = sel;
    const procs = Array.from({ length: 300 }, (_, i) => ({ pid: 1000 - i, cpu: (i * 7) % 11, memMB: i % 5, name: `p${i}`, command: '' }));
    const cmp = comparator({ sortBy: 'cpu', sortDir: 'desc' });
    assert.deepEqual(topBy(procs, 5, cmp), [...procs].sort(cmp).slice(0, 5));
    assert.deepEqual(topBy(procs.slice(0, 3), 5, cmp), [...procs.slice(0, 3)].sort(cmp));
    assert.deepEqual(topBy([], 5, cmp), []);
});

test('buildTree descendant counts on a deep tree', () => {
    const chain = [1, 2, 3, 4].map((pid) => ({ pid, ppid: pid - 1 || 1, name: `n${pid}`, command: '', cpu: 0, memMB: 0 }));
    const leaves = [5, 6].map((pid) => ({ pid, ppid: 2, name: `n${pid}`, command: '', cpu: 0, memMB: 0 }));
    const rows = sel.buildTree([...chain, ...leaves], { sortBy: 'pid', sortDir: 'asc', filterQuery: '', collapsedPids: [] });
    assert.deepEqual(rows.map((r) => [r.pid, r.descendantCount]), [[1, 5], [2, 4], [3, 1], [4, 0], [5, 0], [6, 0]]);
});

test('indexChildren stays linear for a parent with many children (it was quadratic)', () => {
    const procs = Array.from({ length: 20000 }, (_, i) => ({ pid: i + 2, ppid: 1 }));
    const t0 = performance.now();
    const children = sel.indexChildren(procs);
    assert.ok(performance.now() - t0 < 200, `${(performance.now() - t0).toFixed(0)} ms`);
    assert.equal(children.get(1).length, 20000);
    assert.equal(children.get(1)[19999], 20001);
});

test('linkManaged does no tree work when nothing managed is running', () => {
    const procs = [{ pid: 1, ppid: 1, cpu: 1, memMB: 1 }];
    assert.deepEqual(sel.linkManaged(procs, [{ id: 'api', pid: null }]), { byPid: new Map(), resources: new Map() });
});
