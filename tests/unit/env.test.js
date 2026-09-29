const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveEnv } = require('../../core/processManager/env');

const files = (map) => (path) => {
    if (!(path in map)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return map[path];
};

test('precedence: inherited < envFile < inline env (PRD P9)', () => {
    const def = { env: { PORT: '4000' }, envFile: { path: '/app/.env', optional: true } };
    const { env } = resolveEnv(def, {
        baseEnv: { PATH: '/bin', PORT: '1', DEBUG: 'base' },
        readFileSync: files({ '/app/.env': 'PORT=2\nDEBUG=file\n' }),
    });
    assert.equal(env.PATH, '/bin');
    assert.equal(env.DEBUG, 'file');
    assert.equal(env.PORT, '4000');
});

test('the default .env is optional; an explicit envFile that is missing is an error', () => {
    const optional = resolveEnv({ env: {}, envFile: { path: '/app/.env', optional: true } }, { baseEnv: {}, readFileSync: files({}) });
    assert.deepEqual(optional.env, {});
    assert.throws(
        () => resolveEnv({ env: {}, envFile: { path: '/app/.env.local', optional: false } }, { baseEnv: {}, readFileSync: files({}) }),
        /env file not found: \/app\/\.env\.local/
    );
});

test('ad-hoc processes without an envFile just merge inline env', () => {
    const { env } = resolveEnv({ env: { A: '1' } }, { baseEnv: { B: '2' }, readFileSync: files({}) });
    assert.deepEqual(env, { B: '2', A: '1' });
});

test('dotenv warnings are passed on with the file name', () => {
    const { warnings } = resolveEnv({ env: {}, envFile: { path: '/app/.env', optional: true } }, { baseEnv: {}, readFileSync: files({ '/app/.env': 'not a pair\n' }) });
    assert.deepEqual(warnings, ['/app/.env line 1: expected KEY=value']);
});
