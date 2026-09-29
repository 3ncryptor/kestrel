const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeConfigFile, addProcess, toConfigEntry } = require('../../core/config/save');

function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-save-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

test('writeConfigFile writes pretty JSON and never overwrites without force', (t) => {
    const file = path.join(tempDir(t), 'kestrel.json');
    const raw = { version: 1, processes: { api: { cmd: 'npm start' } } };
    writeConfigFile(file, raw);
    assert.equal(fs.readFileSync(file, 'utf-8'), `${JSON.stringify(raw, null, 2)}\n`);
    assert.throws(() => writeConfigFile(file, raw), (err) => err.code === 'EEXIST' && /already exists/.test(err.message));
    writeConfigFile(file, { version: 1, processes: { web: { cmd: 'npm run dev' } } }, { force: true });
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8')).processes), ['web']);
});

test('writeConfigFile refuses a config that would not load', (t) => {
    const file = path.join(tempDir(t), 'kestrel.json');
    assert.throws(() => writeConfigFile(file, { version: 1, processes: { api: {} } }), /processes\.api\.cmd required/);
    assert.equal(fs.existsSync(file), false);
});

test('addProcess creates kestrel.json or adds to it, keeping what is there', (t) => {
    const file = path.join(tempDir(t), 'kestrel.json');
    addProcess(file, 'api', { cmd: 'npm start' });
    addProcess(file, 'worker', { cmd: 'node worker.js', env: { QUEUE: 'jobs' } });
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.deepEqual(saved, { version: 1, processes: { api: { cmd: 'npm start' }, worker: { cmd: 'node worker.js', env: { QUEUE: 'jobs' } } } });
    assert.throws(() => addProcess(file, 'api', { cmd: 'x' }), /"api" is already in kestrel\.json/);
});

test('addProcess reports a kestrel.json that is not valid JSON instead of replacing it', (t) => {
    const file = path.join(tempDir(t), 'kestrel.json');
    fs.writeFileSync(file, '{ nope');
    assert.throws(() => addProcess(file, 'api', { cmd: 'npm start' }), /not valid JSON/);
    assert.equal(fs.readFileSync(file, 'utf-8'), '{ nope');
});

test('toConfigEntry keeps only what differs from the defaults, with a relative cwd', () => {
    const base = path.resolve('/work/app');
    assert.deepEqual(toConfigEntry({ cmd: 'npm start', cwd: base, env: {} }, base), { cmd: 'npm start' });
    assert.deepEqual(toConfigEntry({ cmd: 'vite', cwd: path.join(base, 'web'), env: { PORT: '5173' } }, base), {
        cmd: 'vite', cwd: 'web', env: { PORT: '5173' },
    });
    assert.deepEqual(toConfigEntry({ cmd: 'x', cwd: path.resolve('/srv/other'), env: {} }, base), { cmd: 'x', cwd: path.resolve('/srv/other') });
});
