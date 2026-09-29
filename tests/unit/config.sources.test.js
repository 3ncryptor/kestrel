const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseDotenv, loadEnvFile } = require('../../core/config/dotenv');
const { parseProcfile } = require('../../core/config/procfile');
const { detectScripts, scriptsToConfig } = require('../../core/config/packageJson');
const pm2 = require('../../core/config/pm2');
const { validateConfig } = require('../../core/config/schema');

function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-cfg-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

// ---------- dotenv ----------

test('parseDotenv handles export, quotes, escapes and comments', () => {
    const text = [
        '# comment',
        '',
        'PORT=3000',
        'export NODE_ENV=development',
        'GREETING="hello\\nworld" # trailing',
        "RAW='keep $HOME \\n literal'",
        'URL=http://x.test/#anchor',
        'SPACED = padded value  # note',
        'EMPTY=',
    ].join('\n');
    assert.deepEqual(parseDotenv(text), {
        vars: {
            PORT: '3000',
            NODE_ENV: 'development',
            GREETING: 'hello\nworld',
            RAW: 'keep $HOME \\n literal',
            URL: 'http://x.test/#anchor',
            SPACED: 'padded value',
            EMPTY: '',
        },
        warnings: [],
    });
});

test('parseDotenv warns about lines it cannot use, with line numbers', () => {
    const { vars, warnings } = parseDotenv('GOOD=1\nnot a pair\n1BAD=x\nOPEN="never closed\n');
    assert.deepEqual(vars, { GOOD: '1' });
    assert.deepEqual(warnings.map((w) => w.line), [2, 3, 4]);
});

test('loadEnvFile tolerates a missing optional file but not a missing required one', (t) => {
    const dir = tempDir(t);
    fs.writeFileSync(path.join(dir, '.env'), 'A=1\n');
    assert.deepEqual(loadEnvFile({ path: path.join(dir, '.env'), optional: false }).vars, { A: '1' });
    assert.deepEqual(loadEnvFile({ path: path.join(dir, 'nope'), optional: true }).vars, {});
    assert.throws(() => loadEnvFile({ path: path.join(dir, 'nope'), optional: false }), /env file not found/);
});

// ---------- Procfile ----------

test('parseProcfile reads name: command lines and skips comments', () => {
    const { processes, warnings } = parseProcfile('# stack\nweb: npm start\nworker:   node worker.js --queue=a:b\n\nbad line\n');
    assert.deepEqual(processes, { web: { cmd: 'npm start' }, worker: { cmd: 'node worker.js --queue=a:b' } });
    assert.deepEqual(warnings, [{ line: 5, message: 'expected "name: command"' }]);
});

test('parseProcfile warns about duplicate names', () => {
    const { processes, warnings } = parseProcfile('web: a\nweb: b\n');
    assert.deepEqual(processes, { web: { cmd: 'a' } });
    assert.match(warnings[0].message, /duplicate/);
});

// ---------- package.json ----------

const PKG = JSON.stringify({
    scripts: { dev: 'vite', 'dev:api': 'tsx watch server/index.ts', build: 'vite build', test: 'vitest', lint: 'eslint .', predev: 'echo hi', start: 'node dist/server.js', queue: 'nodemon worker.js' },
});

test('detectScripts picks the runner from the lockfile and preselects long-running scripts', () => {
    const { runner, scripts } = detectScripts({ packageJsonText: PKG, files: ['pnpm-lock.yaml'] });
    assert.equal(runner, 'pnpm');
    const pre = Object.fromEntries(scripts.map((s) => [s.name, s.preselected]));
    assert.deepEqual(pre, { dev: true, 'dev:api': true, build: false, test: false, lint: false, start: true, queue: true });
    assert.equal(scripts.some((s) => s.name === 'predev'), false, 'lifecycle hooks are hidden');
});

test('detectScripts defaults to npm and reports invalid package.json', () => {
    assert.equal(detectScripts({ packageJsonText: PKG, files: [] }).runner, 'npm');
    assert.equal(detectScripts({ packageJsonText: PKG, files: ['bun.lock'] }).runner, 'bun');
    assert.equal(detectScripts({ packageJsonText: PKG, files: ['yarn.lock'] }).runner, 'yarn');
    assert.throws(() => detectScripts({ packageJsonText: '{nope', files: [] }), /package.json is not valid JSON/);
    assert.deepEqual(detectScripts({ packageJsonText: '{}', files: [] }).scripts, []);
});

test('scriptsToConfig produces a valid kestrel config with safe names', () => {
    const raw = scriptsToConfig('pnpm', ['dev', 'dev:api']);
    assert.deepEqual(raw, { version: 1, processes: { dev: { cmd: 'pnpm run dev' }, 'dev-api': { cmd: 'pnpm run dev:api' } } });
    assert.equal(validateConfig(raw, { baseDir: '/r' }).ok, true);
});

// ---------- pm2 ----------

const JLIST = JSON.stringify([
    {
        name: 'api',
        pm2_env: {
            pm_exec_path: '/srv/app/server.js', args: ['--port', '3000'], pm_cwd: '/srv/app', exec_interpreter: 'node',
            autorestart: true, max_restarts: 15, exec_mode: 'fork_mode', instances: 1, env: { SECRET: 'do-not-copy' },
        },
    },
    {
        name: 'worker',
        pm2_env: { pm_exec_path: '/srv/app/run.sh', args: [], pm_cwd: '/srv/app', exec_interpreter: 'none', autorestart: false, exec_mode: 'cluster_mode', instances: 4 },
    },
]);

test('fromJlist maps running pm2 apps and never copies the daemon environment', () => {
    const { config, warnings } = pm2.fromJlist(JLIST);
    assert.deepEqual(config.processes.api, { cmd: 'node /srv/app/server.js --port 3000', cwd: '/srv/app', restart: 'always', maxRestarts: 15 });
    assert.deepEqual(config.processes.worker, { cmd: '/srv/app/run.sh', cwd: '/srv/app', restart: 'never' });
    assert.equal(JSON.stringify(config).includes('do-not-copy'), false);
    assert.ok(warnings.some((w) => /worker.*cluster/.test(w)));
    assert.ok(warnings.some((w) => /env/.test(w)));
    assert.equal(validateConfig(config, { baseDir: '/srv/app' }).ok, true);
});

test('fromEcosystem maps declared apps, env and unsupported options', () => {
    const eco = {
        apps: [
            { name: 'web app', script: 'server.js', args: 'start --verbose', env: { PORT: 8080 }, watch: true, env_production: { X: 1 } },
            { name: 'py', script: 'main.py', interpreter: 'python3', instances: 'max', cron_restart: '0 * * * *' },
            { script: 'unnamed.js' },
        ],
    };
    const { config, warnings } = pm2.fromEcosystem(eco);
    assert.deepEqual(config.processes['web-app'], { cmd: 'node server.js start --verbose', env: { PORT: '8080' }, restart: 'always' });
    assert.equal(config.processes.py.cmd, 'python3 main.py');
    assert.ok(config.processes.unnamed);
    const text = warnings.join('\n');
    assert.match(text, /web-app: watch/);
    assert.match(text, /env_production/);
    assert.match(text, /py: .*instances/);
    assert.match(text, /cron_restart/);
});

test('quoteArg only quotes when needed', () => {
    assert.equal(pm2.quoteArg('--port=3000'), '--port=3000');
    assert.equal(pm2.quoteArg('hello world'), "'hello world'");
    assert.equal(pm2.quoteArg("it's"), "'it'\\''s'");
});

test('loadEcosystemFile reads JSON directly and asks before executing JS', async (t) => {
    const dir = tempDir(t);
    const json = path.join(dir, 'ecosystem.config.json');
    fs.writeFileSync(json, JSON.stringify({ apps: [{ name: 'a', script: 'a.js' }] }));
    assert.equal((await pm2.loadEcosystemFile(json, { confirm: async () => false })).apps[0].name, 'a');

    const js = path.join(dir, 'ecosystem.config.js');
    fs.writeFileSync(js, 'module.exports = { apps: [{ name: "b", script: "b.js" }] };');
    await assert.rejects(() => pm2.loadEcosystemFile(js, { confirm: async () => false }), /cancelled/i);
    const prompts = [];
    const loaded = await pm2.loadEcosystemFile(js, { confirm: async (msg) => prompts.push(msg) > 0 });
    assert.equal(loaded.apps[0].name, 'b');
    assert.match(prompts[0], /execute/);
});

test('importPm2 prefers the running pm2 list, then falls back to an ecosystem file', async (t) => {
    const dir = tempDir(t);
    const running = await pm2.importPm2({ cwd: dir, exec: async () => ({ stdout: JLIST }), confirm: async () => true });
    assert.equal(running.source, 'pm2 jlist');
    assert.ok(running.config.processes.api);

    fs.writeFileSync(path.join(dir, 'ecosystem.config.json'), JSON.stringify({ apps: [{ name: 'eco', script: 'e.js' }] }));
    const noPm2 = async () => {
        throw Object.assign(new Error('spawn pm2 ENOENT'), { code: 'ENOENT' });
    };
    const fromFile = await pm2.importPm2({ cwd: dir, exec: noPm2, confirm: async () => true });
    assert.equal(fromFile.source, path.join(dir, 'ecosystem.config.json'));
    assert.ok(fromFile.config.processes.eco);

    fs.rmSync(path.join(dir, 'ecosystem.config.json'));
    await assert.rejects(() => pm2.importPm2({ cwd: dir, exec: noPm2, confirm: async () => true }), /No running pm2 and no ecosystem file/);
});

test('importPm2 with an explicit file skips pm2 jlist', async (t) => {
    const dir = tempDir(t);
    const file = path.join(dir, 'custom.json');
    fs.writeFileSync(file, JSON.stringify({ apps: [{ name: 'c', script: 'c.js' }] }));
    let called = false;
    const exec = async () => {
        called = true;
        return { stdout: '[]' };
    };
    const result = await pm2.importPm2({ cwd: dir, file, exec, confirm: async () => true });
    assert.equal(called, false);
    assert.ok(result.config.processes.c);
});
