const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyTarget, verifyConfirmation, PolicyError } = require('../../core/systemControl/policy');

const ctx = { selfPid: 500, parentPid: 499, currentUser: 'alice' };
const row = (extra = {}) => ({ pid: 812, name: 'node', user: 'alice', managedId: null, ...extra });

test('pid 0/1, Kestrel itself and its parent shell are blocked', () => {
    assert.equal(classifyTarget({ ...ctx, pid: 1, target: row({ pid: 1, name: 'launchd', user: 'root' }) }).tier, 'blocked');
    assert.equal(classifyTarget({ ...ctx, pid: 0, target: null }).tier, 'blocked');
    assert.match(classifyTarget({ ...ctx, pid: 500, target: row({ pid: 500 }) }).reason, /Kestrel itself/);
    assert.match(classifyTarget({ ...ctx, pid: 499, target: row({ pid: 499 }) }).reason, /shell/);
});

test('a pid that is no longer in the process list is blocked with a clear reason', () => {
    assert.match(classifyTarget({ ...ctx, pid: 7777, target: null }).reason, /no longer running/);
});

test('managed, own and system tiers', () => {
    assert.equal(classifyTarget({ ...ctx, pid: 812, target: row({ managedId: 'api' }) }).tier, 'managed');
    assert.equal(classifyTarget({ ...ctx, pid: 812, target: row() }).tier, 'own');
    assert.equal(classifyTarget({ ...ctx, pid: 99, target: row({ pid: 99, name: 'WindowServer', user: '_windowserver' }) }).tier, 'system');
    assert.equal(classifyTarget({ ...ctx, pid: 99, target: row({ pid: 99, user: 'root' }) }).tier, 'system');
});

test('verifyConfirmation requires a token that matches the tier', () => {
    const own = { tier: 'own', reason: '' };
    assert.doesNotThrow(() => verifyConfirmation(own, { tier: 'own' }, row()));
    assert.throws(() => verifyConfirmation(own, undefined, row()), (e) => e instanceof PolicyError && e.code === 'ECONFIRM');
    assert.throws(() => verifyConfirmation(own, { tier: 'system', typedName: 'node' }, row()), /confirm/);
});

test('system processes need the exact name typed', () => {
    const system = { tier: 'system', reason: '' };
    const target = row({ name: 'WindowServer', user: '_windowserver' });
    assert.doesNotThrow(() => verifyConfirmation(system, { tier: 'system', typedName: 'WindowServer' }, target));
    assert.throws(() => verifyConfirmation(system, { tier: 'system', typedName: 'windowserver' }, target), /type/);
    assert.throws(() => verifyConfirmation(system, { tier: 'system' }, target), /type/);
});

test('blocked targets can never be confirmed', () => {
    const blocked = { tier: 'blocked', reason: 'pid 1 (launchd) is protected' };
    assert.throws(
        () => verifyConfirmation(blocked, { tier: 'blocked' }, row()),
        (e) => e.code === 'EBLOCKED' && /protected/.test(e.message)
    );
});
