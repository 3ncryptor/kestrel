// kestrel pm / init / import pm2 through main() (M3 C1–C3). No UI: pm is checked up to the terminal check.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { main } = require('../../cli');

function project(t, files = {}) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-cli-')));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(dir, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    }
    return dir;
}

/** @param {string} cwd @param {string[]} [answers] lines typed at the prompts */
function run(cwd, argv, answers = []) {
    const out = [];
    const err = [];
    const io = {
        stdout: { write: (s) => out.push(s) },
        stderr: { write: (s) => err.push(s) },
        stdin: Readable.from(answers.map((a) => `${a}\n`)),
        cwd,
        env: {},
    };
    return main(argv, io).then((code) => ({ code, out: out.join(''), err: err.join('') }));
}

const readConfig = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'kestrel.json'), 'utf-8'));

// ---------- pm ----------

test('pm lists every config problem with its path and exits 2 (usable as a CI check)', async (t) => {
    const dir = project(t, { 'kestrel.json': { version: 1, processes: { api: { cmd: 'x', restart: 'sometimes', ready: { port: 0 } } } } });
    const { code, err } = await run(dir, ['pm']);
    assert.equal(code, 2);
    assert.match(err, /kestrel\.json has 2 problems/);
    assert.match(err, /processes\.api\.restart\s+must be one of/);
    assert.match(err, /processes\.api\.ready\.port\s+must be a port number/);
});

test('pm without a stack points to kestrel init; unknown --only names are usage errors', async (t) => {
    const empty = await run(project(t), ['pm']);
    assert.equal(empty.code, 1);
    assert.match(empty.err, /No stack here[\s\S]*kestrel init/);

    const dir = project(t, { Procfile: 'web: sleep 20\nworker: sleep 20\n' });
    const only = await run(dir, ['pm', '--only', 'web,nope']);
    assert.equal(only.code, 2);
    assert.match(only.err, /Unknown process "nope" \(the stack has: web, worker\)/);
});

test('a valid pm stack gets as far as the terminal check', async (t) => {
    const dir = project(t, { Procfile: 'web: sleep 20\n' });
    const { code, err } = await run(dir, ['pm', '--only', 'web']);
    assert.equal(code, 1);
    assert.match(err, /Bun|interactive terminal/);
});

// ---------- init ----------

test('init turns a Procfile into kestrel.json and never overwrites without --force', async (t) => {
    const dir = project(t, { Procfile: 'web: npm start\nworker: node worker.js\n' });
    const first = await run(dir, ['init']);
    assert.equal(first.code, 0, first.err);
    assert.deepEqual(readConfig(dir).processes, { web: { cmd: 'npm start' }, worker: { cmd: 'node worker.js' } });
    assert.match(first.out, /Created kestrel\.json with 2 processes: web, worker[\s\S]*kestrel pm/);

    const again = await run(dir, ['init']);
    assert.equal(again.code, 1);
    assert.match(again.err, /already exists[\s\S]*--force/);
    assert.equal((await run(dir, ['init', '--force'])).code, 0);
});

test('init picks package.json scripts at a prompt and offers to ignore .kestrel/', async (t) => {
    const dir = project(t, {
        'package.json': { scripts: { dev: 'vite', build: 'vite build', worker: 'node w.js' } },
        '.gitignore': 'node_modules\n',
    });
    const { code, out, err } = await run(dir, ['init'], ['1,3', 'y']);
    assert.equal(code, 0, err);
    assert.match(out, /1\. \[x\] dev\s+vite/);
    assert.match(out, /2\. \[ \] build/);
    assert.deepEqual(readConfig(dir).processes, { dev: { cmd: 'npm run dev' }, worker: { cmd: 'npm run worker' } });
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'), 'node_modules\n.kestrel/\n');
});

test('init --yes takes the defaults: preselected scripts, and .kestrel/ ignored', async (t) => {
    const dir = project(t, { 'package.json': { scripts: { start: 'node server.js', test: 'node --test' } }, '.git/HEAD': 'ref' });
    const { code } = await run(dir, ['init', '--yes']);
    assert.equal(code, 0);
    assert.deepEqual(Object.keys(readConfig(dir).processes), ['start']);
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'), '.kestrel/\n');
});

test('init asks for a command when there is nothing to detect', async (t) => {
    const dir = project(t);
    const typed = await run(dir, ['init'], ['node server.js']);
    assert.equal(typed.code, 0, typed.err);
    assert.deepEqual(readConfig(dir).processes, { server: { cmd: 'node server.js' } });

    const nothing = await run(project(t), ['init', '--yes']);
    assert.equal(nothing.code, 1);
    assert.match(nothing.err, /Nothing to put in kestrel\.json/);
});

test('init rejects an invalid choice without writing anything', async (t) => {
    const dir = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
    const { code, err } = await run(dir, ['init'], ['7']);
    assert.equal(code, 1);
    assert.match(err, /No script number 7/);
    assert.equal(fs.existsSync(path.join(dir, 'kestrel.json')), false);
});

// ---------- import pm2 ----------

test('import pm2 converts an ecosystem file, prints warnings and starts nothing', async (t) => {
    const dir = project(t, {
        'ecosystem.config.json': { apps: [{ name: 'api', script: 'server.js', instances: 4, exec_mode: 'cluster' }] },
    });
    const { code, out, err } = await run(dir, ['import', 'pm2', 'ecosystem.config.json']);
    assert.equal(code, 0, err);
    assert.equal(readConfig(dir).processes.api.cmd, 'node server.js');
    assert.match(out, /Imported 1 process from .*ecosystem\.config\.json: api/);
    assert.match(out, /cluster mode/);
    assert.match(out, /Nothing was started/);
    assert.equal((await run(dir, ['import', 'pm2', 'ecosystem.config.json'])).code, 1, 'no overwrite without --force');
});

test('import pm2 only executes a .js ecosystem file after the user agrees', async (t) => {
    const dir = project(t, {
        'ecosystem.config.js': `require('fs').writeFileSync(__dirname + '/executed', '');\nmodule.exports = { apps: [{ name: 'api', script: 'server.js' }] };\n`,
    });
    const declined = await run(dir, ['import', 'pm2', 'ecosystem.config.js'], ['n']);
    assert.equal(declined.code, 1);
    assert.match(declined.err, /cancelled/);
    assert.equal(fs.existsSync(path.join(dir, 'executed')), false);

    const accepted = await run(dir, ['import', 'pm2', 'ecosystem.config.js'], ['y']);
    assert.equal(accepted.code, 0, accepted.err);
    assert.ok(fs.existsSync(path.join(dir, 'executed')));
});
