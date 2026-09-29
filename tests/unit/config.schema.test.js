const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateConfig } = require('../../core/config/schema');
const { findCycle, startWaves } = require('../../core/stack/graph');

const BASE = '/repo';
const errorsOf = (raw) => validateConfig(raw, { baseDir: BASE }).errors;
const paths = (raw) => errorsOf(raw).map((e) => e.path);

// ---------- graph ----------

test('startWaves groups independent processes and orders dependents after their dependencies', () => {
    const nodes = [
        { name: 'web', dependsOn: ['api'] },
        { name: 'db', dependsOn: [] },
        { name: 'api', dependsOn: ['db', 'cache'] },
        { name: 'cache', dependsOn: [] },
        { name: 'worker', dependsOn: ['db'] },
    ];
    assert.deepEqual(startWaves(nodes), [['db', 'cache'], ['api', 'worker'], ['web']]);
});

test('findCycle names the cycle as a path, or returns null', () => {
    assert.deepEqual(findCycle([{ name: 'api', dependsOn: ['worker'] }, { name: 'worker', dependsOn: ['api'] }]), ['api', 'worker', 'api']);
    assert.equal(findCycle([{ name: 'a', dependsOn: [] }, { name: 'b', dependsOn: ['a'] }]), null);
});

// ---------- schema: happy path and defaults ----------

test('a minimal config is normalized with defaults and absolute paths', () => {
    const result = validateConfig({ version: 1, processes: { api: { cmd: 'npm run dev' } } }, { baseDir: BASE });
    assert.equal(result.ok, true);
    assert.deepEqual(result.config.processes, [{
        name: 'api',
        cmd: 'npm run dev',
        cwd: BASE,
        env: {},
        envFile: { path: path.join(BASE, '.env'), optional: true },
        dependsOn: [],
        ready: null,
        restart: 'on-failure',
        maxRestarts: 10,
        stopSignal: 'SIGTERM',
        stopTimeoutMs: 5000,
    }]);
    assert.deepEqual(result.config.monitor, { intervalMs: 1000, thresholds: { cpu: [50, 80], memMB: [500, 1500] } });
    assert.deepEqual(result.config.startOrder, [['api']]);
});

test('the full BUILD_PLAN example validates', () => {
    const raw = {
        version: 1,
        processes: {
            db: { cmd: 'docker compose up postgres', ready: { port: 5432 } },
            api: {
                cmd: 'npm run dev', cwd: './server', envFile: '.env.local', env: { PORT: 3000, DEBUG: true },
                dependsOn: ['db'], ready: { http: 'http://localhost:3000/health', timeoutMs: 30000 },
                restart: 'always', maxRestarts: 3, stopSignal: 'SIGINT', stopTimeoutMs: 2000,
            },
            worker: { cmd: 'node worker.js', ready: { log: 'worker ready' } },
        },
        monitor: { intervalMs: 2000, thresholds: { cpu: [60, 90], memMB: [1000, 2000] } },
    };
    const { ok, config, errors } = validateConfig(raw, { baseDir: BASE });
    assert.deepEqual(errors, []);
    assert.equal(ok, true);
    const api = config.processes.find((p) => p.name === 'api');
    assert.equal(api.cwd, path.join(BASE, 'server'));
    assert.deepEqual(api.envFile, { path: path.join(BASE, 'server', '.env.local'), optional: false });
    assert.deepEqual(api.env, { PORT: '3000', DEBUG: 'true' }, 'scalars are stringified');
    assert.deepEqual(api.ready, { kind: 'http', target: 'http://localhost:3000/health', timeoutMs: 30000 });
    assert.deepEqual(config.processes[0].ready, { kind: 'port', target: 5432, timeoutMs: 60000 });
    assert.deepEqual(config.startOrder, [['db', 'worker'], ['api']]);
});

// ---------- schema: errors are collected with exact paths ----------

test('all errors are reported at once, each with its path', () => {
    const raw = {
        version: 2,
        processes: {
            'bad name!': { cmd: 'x' },
            api: { cmd: '', dependsOn: ['dbb', 'api'], ready: { port: 99999 }, restart: 'sometimes', maxRestarts: -1, colour: 'red' },
        },
        monitor: { intervalMs: 10, thresholds: { cpu: [90, 50] } },
        extra: true,
    };
    assert.deepEqual(paths(raw).sort(), [
        'extra',
        'monitor.intervalMs',
        'monitor.thresholds.cpu',
        'processes.api.cmd',
        'processes.api.colour',
        'processes.api.dependsOn[0]',
        'processes.api.dependsOn[1]',
        'processes.api.maxRestarts',
        'processes.api.ready.port',
        'processes.api.restart',
        'processes.bad name!',
        'version',
    ]);
    assert.equal(validateConfig(raw, { baseDir: BASE }).ok, false);
});

test('error messages explain the fix', () => {
    const errors = errorsOf({ version: 1, processes: { api: { cmd: 'x', dependsOn: ['dbb'] } } });
    assert.deepEqual(errors, [{ path: 'processes.api.dependsOn[0]', message: 'unknown process "dbb"' }]);
});

test('ready must contain exactly one of port, http or log', () => {
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', ready: {} } } }), ['processes.a.ready']);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', ready: { port: 1, log: 'y' } } } }), ['processes.a.ready']);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', ready: { http: 'ftp://x' } } } }), ['processes.a.ready.http']);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', ready: { log: '([' } } } }), ['processes.a.ready.log']);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', ready: { port: 80, timeoutMs: 0 } } } }), ['processes.a.ready.timeoutMs']);
});

test('dependency cycles are rejected with the cycle spelled out', () => {
    const errors = errorsOf({ version: 1, processes: { api: { cmd: 'x', dependsOn: ['worker'] }, worker: { cmd: 'y', dependsOn: ['api'] } } });
    assert.deepEqual(errors, [{ path: 'processes', message: 'dependency cycle: api → worker → api' }]);
});

test('structural problems are reported clearly', () => {
    assert.deepEqual(paths(null), ['(root)']);
    assert.deepEqual(paths([]), ['(root)']);
    assert.deepEqual(paths({ version: 1 }), ['processes']);
    assert.deepEqual(paths({ version: 1, processes: {} }), ['processes']);
    assert.deepEqual(paths({ version: 1, processes: { a: 'npm start' } }), ['processes.a']);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x', env: { A: {} }, cwd: 5, stopSignal: 'SIGNOPE', stopTimeoutMs: 'soon' } } }).sort(), [
        'processes.a.cwd', 'processes.a.env.A', 'processes.a.stopSignal', 'processes.a.stopTimeoutMs',
    ]);
    assert.deepEqual(paths({ version: 1, processes: { a: { cmd: 'x' } }, monitor: { thresholds: { memMB: 'big', gpu: [1, 2] } } }).sort(), [
        'monitor.thresholds.gpu', 'monitor.thresholds.memMB',
    ]);
});

test('$schema is allowed for editor support', () => {
    assert.equal(validateConfig({ $schema: './kestrel.schema.json', version: 1, processes: { a: { cmd: 'x' } } }, { baseDir: BASE }).ok, true);
});
