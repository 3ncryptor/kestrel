const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findUp, loadStack } = require('../../core/config');

function tempTree(t, files) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-disc-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), content);
    }
    return root;
}

const KESTREL = JSON.stringify({ version: 1, processes: { api: { cmd: 'npm run dev', cwd: './server' } } });

test('findUp walks up to the nearest match', (t) => {
    const root = tempTree(t, { 'kestrel.json': KESTREL, 'a/b/c/.keep': '' });
    assert.equal(findUp(path.join(root, 'a', 'b', 'c'), 'kestrel.json'), path.join(root, 'kestrel.json'));
    assert.equal(findUp(path.join(root, 'a'), 'definitely-missing-file.xyz'), null);
});

test('kestrel.json found in a parent wins and paths resolve from its folder', (t) => {
    const root = tempTree(t, { 'kestrel.json': KESTREL, 'server/src/.keep': '', 'server/src/Procfile': 'x: y' });
    const stack = loadStack({ cwd: path.join(root, 'server', 'src') });
    assert.equal(stack.source, 'kestrel.json');
    assert.equal(stack.path, path.join(root, 'kestrel.json'));
    assert.equal(stack.config.processes[0].cwd, path.join(root, 'server'));
});

test('an explicit --config path is used as given, and must exist', (t) => {
    const root = tempTree(t, { 'ops/stack.json': KESTREL });
    const stack = loadStack({ cwd: root, configPath: 'ops/stack.json' });
    assert.equal(stack.source, 'kestrel.json');
    assert.equal(stack.config.processes[0].cwd, path.join(root, 'ops', 'server'));
    assert.throws(() => loadStack({ cwd: root, configPath: 'nope.json' }), /Config file not found/);
});

test('invalid JSON and invalid configs come back as errors, not exceptions', (t) => {
    const broken = tempTree(t, { 'kestrel.json': '{ "version": 1, ' });
    const a = loadStack({ cwd: broken });
    assert.equal(a.config, null);
    assert.match(a.errors[0].message, /not valid JSON/);

    const invalid = tempTree(t, { 'kestrel.json': JSON.stringify({ version: 1, processes: { api: {} } }) });
    const b = loadStack({ cwd: invalid });
    assert.deepEqual(b.errors, [{ path: 'processes.api.cmd', message: 'required' }]);
});

test('a Procfile in the current folder is used when there is no kestrel.json', (t) => {
    const root = tempTree(t, { Procfile: 'web: npm start\nworker: node w.js\n' });
    const stack = loadStack({ cwd: root });
    assert.equal(stack.source, 'Procfile');
    assert.deepEqual(stack.config.processes.map((p) => p.name), ['web', 'worker']);
});

test('package.json scripts are detected but never started without a choice', (t) => {
    const root = tempTree(t, { 'package.json': JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } }), 'bun.lock': '' });
    const stack = loadStack({ cwd: root });
    assert.equal(stack.source, 'package.json');
    assert.equal(stack.config, null);
    assert.equal(stack.detected.runner, 'bun');
    assert.deepEqual(stack.detected.scripts.map((s) => s.name), ['dev', 'build']);
});

test('no stack source at all is a normal, empty result', (t) => {
    const root = tempTree(t, { 'README.md': '# nothing here' });
    const stack = loadStack({ cwd: root, stopAt: root });
    assert.deepEqual(stack, { source: null, path: null, config: null, errors: [], warnings: [], detected: null });
});
