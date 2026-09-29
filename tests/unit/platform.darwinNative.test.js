// The native macOS sampler's logic, against a fake libproc layer (the real one is tested under Bun
// on macOS in platform.darwinFfi.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeSource, parseOthersPs } = require('../../core/platform/darwinNative');

const START = 1_790_000_000; // epoch seconds

/** A fake of core/platform/darwinFfi.js: 100 and 200 are ours (full info), 1 and 88 belong to others. */
function fakeNative() {
    const calls = { path: [], userName: [] };
    const own = {
        100: { ppid: 1, uid: 501, status: 2, running: 1, comm: 'node', name: 'node', startSec: START, startUsec: 250000, rssBytes: 50 * 1024 * 1024, cpuNs: 2e9 },
        200: { ppid: 100, uid: 501, status: 3, running: 0, comm: 'esbuild', name: 'esbuild', startSec: START + 5, startUsec: 0, rssBytes: 10 * 1024 * 1024, cpuNs: 1e9 },
    };
    const others = {
        1: { ppid: 0, uid: 0, status: 2, comm: 'launchd' },
        88: { ppid: 1, uid: 88, status: 2, comm: 'WindowServer' },
    };
    const numbersOnly = ({ comm, name, ...numbers }) => numbers; // per-tick calls never decode strings
    const native = {
        listPids: () => [1, 88, 100, 200],
        taskInfo: (pid) => (own[pid] ? numbersOnly(own[pid]) : null),
        shortInfo: (pid) => {
            const p = others[pid] || own[pid];
            return p ? { ppid: p.ppid, uid: p.uid, status: p.status } : null;
        },
        comm: (pid) => {
            calls.comm = (calls.comm || 0) + 1;
            return (others[pid] || own[pid])?.comm ?? null;
        },
        path: (pid) => {
            calls.path.push(pid);
            return { 1: '/sbin/launchd', 88: '/System/WindowServer', 100: '/usr/local/bin/node', 200: '/opt/esbuild' }[pid] || null;
        },
        userName: (uid) => {
            calls.userName.push(uid);
            return { 0: 'root', 88: '_windowserver', 501: 'alice' }[uid] || null;
        },
        vmStats: () => ({ pageSize: 16384, free: 1000, active: 2000, inactive: 1500, wire: 3000, speculative: 100, purgeable: 200, compressor: 400, external: 5000, internal: 7000 }),
        swapUsage: () => ({ totalBytes: 2 * 1024 ** 3, usedBytes: 512 * 1024 ** 2 }),
        listeningSockets: (pid) => ({
            100: [{ port: 3000, address: '*' }, { port: 3000, address: '*' }, { port: 9229, address: '127.0.0.1' }],
        }[pid] || []),
    };
    return { native, own, calls };
}

const PS_OTHERS = '    1   0.3  14560 Ss   3-04:05:06\n   88   5.1  36496 Ss      02:00\n  100  99.0  51200 R       00:10\n';

function source(overrides = {}) {
    const fake = fakeNative();
    let psCalls = 0;
    let clock = 1_790_000_100_000;
    const exec = async (file, args) => {
        psCalls += 1;
        assert.equal(file, 'ps');
        assert.deepEqual(args, ['-A', '-o', 'pid=,pcpu=,rss=,state=,etime=']);
        return { stdout: PS_OTHERS };
    };
    const src = createNativeSource({ native: fake.native, exec, now: () => clock, ...overrides });
    return { src, fake, psCalls: () => psCalls, advance: (ms) => (clock += ms) };
}

test('parseOthersPs reads cpu, memory, state and start time per pid', () => {
    const now = 1_790_000_100_000;
    const map = parseOthersPs(PS_OTHERS, now);
    assert.deepEqual(map.get(88), { cpuPercent: 5.1, rssKB: 36496, state: 'sleeping', startedAt: now - 120_000 });
    assert.equal(map.get(1).startedAt, now - (3 * 86400 + 4 * 3600 + 5 * 60 + 6) * 1000);
    assert.equal(map.get(100).state, 'running');
});

test('own processes come from libproc: cumulative cpu time (ns), exact start time, full path', async () => {
    const { src } = source();
    const procs = await src.listProcesses();
    const node = procs.find((p) => p.pid === 100);
    assert.deepEqual(node, {
        pid: 100, ppid: 1, name: 'node', command: '/usr/local/bin/node', user: 'alice', state: 'running',
        rssKB: 51200, cpuTicks: 2e9, startedAt: START * 1000 + 250,
    });
    assert.equal(procs.find((p) => p.pid === 200).state, 'sleeping');
    assert.equal(src.clockTicks, 1e9, 'cpuTicks are nanoseconds');
});

test('other users\' processes get cpu, memory, state and start from a trimmed ps', async () => {
    const { src } = source();
    const procs = await src.listProcesses();
    assert.deepEqual(procs.find((p) => p.pid === 88), {
        pid: 88, ppid: 1, name: 'WindowServer', command: '/System/WindowServer', user: '_windowserver', state: 'sleeping',
        rssKB: 36496, cpuPercent: 5.1, startedAt: 1_790_000_100_000 - 120_000,
    });
    assert.equal(procs.find((p) => p.pid === 1).user, 'root');
});

test('that ps runs at most every 5 s, and never when every process is ours', async () => {
    const { src, psCalls, advance } = source();
    await src.listProcesses();
    advance(1000);
    await src.listProcesses();
    assert.equal(psCalls(), 1);
    advance(4000);
    await src.listProcesses();
    assert.equal(psCalls(), 2);

    const mine = source();
    mine.fake.native.listPids = () => [100, 200];
    await mine.src.listProcesses();
    assert.equal(mine.psCalls(), 0);
});

test('paths and user names are looked up once per process, and again when a pid is reused', async () => {
    const { src, fake } = source();
    await src.listProcesses();
    await src.listProcesses();
    assert.deepEqual(fake.calls.path.sort((a, b) => a - b), [1, 88, 100, 200]);
    assert.deepEqual([...new Set(fake.calls.userName)].length, fake.calls.userName.length, 'each uid once');

    fake.own[100] = { ...fake.own[100], startSec: START + 999 }; // pid 100 exited and was reused
    await src.listProcesses();
    assert.deepEqual(fake.calls.path.filter((p) => p === 100).length, 2);
});

test('short names are only decoded when a process is new (identity cache miss)', async () => {
    const { src, fake } = source();
    fake.native.path = () => null;
    await src.listProcesses();
    const first = fake.calls.comm;
    await src.listProcesses();
    assert.equal(fake.calls.comm, first);
});

test('a process without a path (kernel, or gone) falls back to its short name', async () => {
    const { src, fake } = source();
    fake.native.path = () => null;
    const procs = await src.listProcesses();
    assert.equal(procs.find((p) => p.pid === 100).command, 'node');
    assert.equal(procs.find((p) => p.pid === 100).name, 'node');
});

test('memory: Activity Monitor\'s "used" from Mach page counts, file cache, and swap', () => {
    const { src } = source();
    const mem = src.memory(16 * 1024 ** 3);
    const pagesMB = (n) => Math.round((n * 16384) / (1024 * 1024));
    assert.deepEqual(mem, {
        totalMB: 16384,
        usedMB: pagesMB(7000 - 200 + 3000 + 400),
        cachedMB: pagesMB(5000),
        swapUsedMB: 512,
        swapTotalMB: 2048,
    });
});

test('listening ports come from our processes\' sockets, de-duplicated and sorted', async () => {
    const { src } = source();
    await src.listProcesses(); // names come from the process identities
    const result = src.listeningPorts({ isRoot: false });
    assert.deepEqual(result, {
        items: [
            { port: 3000, address: '*', proto: 'tcp', pid: 100, name: 'node' },
            { port: 9229, address: '127.0.0.1', proto: 'tcp', pid: 100, name: 'node' },
        ],
        partial: true,
    });
});
