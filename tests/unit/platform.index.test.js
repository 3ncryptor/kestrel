const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatform, PlatformError } = require('../../core/platform');

test('createPlatform picks the adapter for the current OS', () => {
    assert.equal(createPlatform({ platform: 'darwin' }).id, 'darwin');
    assert.equal(createPlatform({ platform: 'linux', clockTicks: 100, pageSize: 4096 }).id, 'linux');
});

test('createPlatform refuses unsupported platforms with a typed error', () => {
    assert.throws(
        () => createPlatform({ platform: 'win32' }),
        (err) => err instanceof PlatformError && err.code === 'EUNSUPPORTED' && /win32/.test(err.message)
    );
});
