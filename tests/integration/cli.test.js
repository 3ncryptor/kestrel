// Runs the real CLI entry point in a child process against the real OS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const CLI = path.join(__dirname, '..', '..', 'cli', 'index.js');
const run = (args) => promisify(execFile)(process.execPath, [CLI, ...args], { encoding: 'utf-8' });

test('sm --dump prints one JSON snapshot per tick from the live system', async () => {
    const { stdout } = await run(['sm', '--dump', '--ticks', '2', '--interval', '250']);
    const snapshots = stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(snapshots.length, 2);

    const [first, second] = snapshots;
    assert.equal(first.tick, 1);
    assert.equal(first.system.cpuPercent, null, 'no CPU baseline on the first tick');
    assert.equal(typeof second.system.cpuPercent, 'number');
    assert.ok(second.system.cores.length > 0);
    assert.ok(second.system.memTotalMB > 0);
    assert.ok(second.processCount > 5);
    assert.ok(second.topProcesses[0].pid > 0);
    assert.equal(second.meta.platform, process.platform);
    assert.ok(Array.isArray(second.ports.items));
});

test('bad usage exits with code 2', async () => {
    await assert.rejects(() => run(['--bogus']), (err) => err.code === 2 && /Unknown option/.test(err.stderr));
});
