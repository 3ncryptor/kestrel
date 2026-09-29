const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sc = require('../../core/systemControl');

function spawnSleeper() {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    return child;
}

test('killByPid terminates a disposable process', async () => {
    const child = spawnSleeper();
    assert.equal(sc.isAlive(child.pid), true);
    const exited = once(child, 'exit');
    sc.killByPid(child.pid, 'SIGTERM');
    const [, signal] = await exited;
    assert.equal(signal, 'SIGTERM');
    assert.equal(sc.isAlive(child.pid), false);
});

test('killByPid validates pid and signal', () => {
    assert.throws(() => sc.killByPid(1), (e) => e.code === 'EINVAL');
    assert.throws(() => sc.killByPid(-5), (e) => e.code === 'EINVAL');
    assert.throws(() => sc.killByPid(1.5), (e) => e.code === 'EINVAL');
    assert.throws(() => sc.killByPid(process.pid), (e) => e.code === 'ESELF');
    assert.throws(() => sc.killByPid(99999, 'SIGBOGUS'), (e) => e.code === 'EINVAL' && /not allowed/.test(e.message));
});

test('killByPid reports a vanished process in plain words', () => {
    // A pid far above the default pid_max on both OSes cannot exist.
    assert.throws(() => sc.killByPid(4194000), (e) => e.code === 'ESRCH' && /no longer exists/.test(e.message));
});

test('translateKillError explains permission problems', () => {
    const err = sc.translateKillError(Object.assign(new Error('x'), { code: 'EPERM' }), 42);
    assert.equal(err.code, 'EPERM');
    assert.match(err.message, /another user/);
});

test('renice lowers the priority of our own process', async () => {
    const child = spawnSleeper();
    try {
        await sc.renice(child.pid, 5);
    } finally {
        child.kill('SIGKILL');
        await once(child, 'exit');
    }
});

test('renice validates the priority range', async () => {
    await assert.rejects(() => sc.renice(4194000, 21), (e) => e.code === 'EINVAL');
    await assert.rejects(() => sc.renice(4194000, 2.5), (e) => e.code === 'EINVAL');
});

test('renice actually changes the nice value, without needing a renice binary', async () => {
    const child = spawnSleeper();
    try {
        await sc.renice(child.pid, 7);
        assert.equal(require('node:os').getPriority(child.pid), 7);
    } finally {
        child.kill('SIGKILL');
        await once(child, 'exit');
    }
});

test('renice reports a vanished process in plain words', async () => {
    await assert.rejects(() => sc.renice(4194000, 5), (e) => e.code === 'ESRCH' && /no longer exists/.test(e.message));
});

test('translateReniceError maps setpriority failures', () => {
    const sysErr = (code) => Object.assign(new Error('x'), { code: 'ERR_SYSTEM_ERROR', info: { code } });
    assert.equal(sc.translateReniceError(sysErr('EACCES'), 42).code, 'EPERM');
    assert.equal(sc.translateReniceError(sysErr('ESRCH'), 42).code, 'ESRCH');
    assert.equal(sc.translateReniceError(new Error('weird'), 42).code, 'ERENICE');
});
