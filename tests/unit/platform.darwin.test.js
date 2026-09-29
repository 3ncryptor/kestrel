const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const darwin = require('../../core/platform/darwin');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'darwin');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);

// ---------- parsers ----------

test('parseEtime handles mm:ss, hh:mm:ss and dd-hh:mm:ss', () => {
    assert.equal(darwin.parseEtime('03:14'), 194);
    assert.equal(darwin.parseEtime('1:02:03'), 3723);
    assert.equal(darwin.parseEtime('18-08:23:27'), 18 * 86400 + 8 * 3600 + 23 * 60 + 27);
    assert.equal(darwin.parseEtime('garbage'), null);
});

test('parsePsLine keeps executable paths that contain spaces', () => {
    const line = '  545     1   0.0  13232 Ss   root             18-08:23:25 /Applications/Cloudflare WARP.app/Contents/Resources/CloudflareWARP';
    const proc = darwin.parsePsLine(line, NOW);
    assert.deepEqual(proc, {
        pid: 545,
        ppid: 1,
        name: 'CloudflareWARP',
        command: '/Applications/Cloudflare WARP.app/Contents/Resources/CloudflareWARP',
        user: 'root',
        state: 'sleeping',
        rssKB: 13232,
        cpuPercent: 0,
        startedAt: NOW - darwin.parseEtime('18-08:23:25') * 1000,
    });
});

test('parsePsLine rejects malformed lines', () => {
    assert.equal(darwin.parsePsLine('not a ps line', NOW), null);
    assert.equal(darwin.parsePsLine('', NOW), null);
});

test('parsePsOutput parses every fixture line', () => {
    const text = fixture('ps.txt');
    const lines = text.split('\n').filter((l) => l.trim());
    const procs = darwin.parsePsOutput(text, NOW);
    assert.equal(procs.length, lines.length);
    assert.equal(procs[0].pid, 1);
    assert.equal(procs[0].ppid, 0);
    assert.equal(procs[0].name, 'launchd');
});

test('parseVmStat reads the page size and page counters', () => {
    const vm = darwin.parseVmStat(fixture('vm_stat.txt'));
    assert.equal(vm.pageSize, 16384);
    assert.equal(vm.pages['pages active'], 76888);
    assert.equal(vm.pages['anonymous pages'], 103931);
    assert.equal(vm.pages['pages occupied by compressor'], 184721);
});

test('memoryUsedMB matches the Activity Monitor definition (app + wired + compressed)', () => {
    const vm = darwin.parseVmStat(fixture('vm_stat.txt'));
    // (anonymous 103931 - purgeable 4 + wired 142776 + compressor 184721) pages * 16 KiB
    assert.equal(darwin.memoryUsedMB(vm), 6741);
});

test('memoryUsedMB falls back to active pages on systems without anonymous counters', () => {
    const vm = { pageSize: 4096, pages: { 'pages active': 256, 'pages wired down': 256, 'pages occupied by compressor': 0 } };
    assert.equal(darwin.memoryUsedMB(vm), 2);
});

test('parseMemsize and parseSwapUsage convert to MB', () => {
    assert.equal(darwin.parseMemsize(fixture('sysctl_memsize.txt')), 8192);
    assert.equal(darwin.parseSwapUsage(fixture('sysctl_swap.txt')), 4863);
    assert.equal(darwin.parseSwapUsage('vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M'), 0);
    assert.equal(darwin.parseSwapUsage('unexpected'), 0);
    assert.equal(darwin.parseSwapTotal(fixture('sysctl_swap.txt')), 6144);
    assert.equal(darwin.parseSwapTotal('unexpected'), 0);
});

test('parseAddress splits IPv4, IPv6 and wildcard listeners', () => {
    assert.deepEqual(darwin.parseAddress('127.0.0.1:3000'), { address: '127.0.0.1', port: 3000 });
    assert.deepEqual(darwin.parseAddress('[::1]:5173'), { address: '::1', port: 5173 });
    assert.deepEqual(darwin.parseAddress('*:80'), { address: '*', port: 80 });
    assert.equal(darwin.parseAddress('nonsense'), null);
});

test('parseLsof groups records by process and removes duplicate sockets', () => {
    const ports = darwin.parseLsof(fixture('lsof.txt'));
    const rapportd = ports.filter((p) => p.pid === 629);
    assert.deepEqual(rapportd, [{ port: 52345, address: '*', proto: 'tcp', pid: 629, name: 'rapportd' }]);
    assert.ok(ports.some((p) => p.pid === 16850 && p.name === 'Antigravity IDE Helper (Plugin)' && p.port === 52567));
    assert.deepEqual(
        ports.map((p) => p.port),
        [...ports.map((p) => p.port)].sort((a, b) => a - b),
        'ports are sorted ascending'
    );
});

// ---------- adapter (I/O through an injected exec) ----------

function fakeExec(outputs) {
    const calls = [];
    const exec = async (file, args) => {
        calls.push([file, ...args]);
        const out = outputs[file];
        if (out instanceof Error) throw out;
        return { stdout: out ?? '' };
    };
    return { exec, calls };
}

test('adapter.listProcesses runs ps without a shell and parses the result', async () => {
    const { exec, calls } = fakeExec({ ps: fixture('ps.txt') });
    const adapter = darwin.createDarwinAdapter({ native: null, exec, now: () => NOW });
    const procs = await adapter.listProcesses();
    assert.equal(calls[0][0], 'ps');
    assert.ok(calls[0].includes('-A'));
    assert.ok(procs.length > 20);
});

test('adapter.memory combines vm_stat, total memory and swap usage', async () => {
    const { exec } = fakeExec({ vm_stat: fixture('vm_stat.txt'), sysctl: fixture('sysctl_swap.txt') });
    const adapter = darwin.createDarwinAdapter({ native: null, exec, totalMemBytes: 8 * 1024 ** 3 });
    // cache = file-backed pages 49415 × 16 KiB
    assert.deepEqual(await adapter.memory(), { totalMB: 8192, usedMB: 6741, cachedMB: 772, swapUsedMB: 4863, swapTotalMB: 6144 });
});

test('adapter.memory spawns sysctl for swap at most every 5 s (total memory never changes)', async () => {
    let clock = 0;
    const { exec, calls } = fakeExec({ vm_stat: fixture('vm_stat.txt'), sysctl: fixture('sysctl_swap.txt') });
    const adapter = darwin.createDarwinAdapter({ native: null, exec, totalMemBytes: 8 * 1024 ** 3, now: () => clock });
    for (let i = 0; i < 6; i++) {
        await adapter.memory();
        clock += 1000;
    }
    assert.equal(calls.filter((c) => c[0] === 'vm_stat').length, 6);
    assert.equal(calls.filter((c) => c[0] === 'sysctl').length, 2);
});

test('adapter.listeningPorts marks results partial when not root', async () => {
    const { exec } = fakeExec({ lsof: fixture('lsof.txt') });
    const user = await darwin.createDarwinAdapter({ native: null, exec, isRoot: false }).listeningPorts();
    const root = await darwin.createDarwinAdapter({ native: null, exec, isRoot: true }).listeningPorts();
    assert.equal(user.partial, true);
    assert.equal(root.partial, false);
    assert.ok(user.items.length > 0);
});

test('adapter.listeningPorts treats lsof exit code 1 with no output as "no listeners"', async () => {
    const noMatches = Object.assign(new Error('Command failed'), { code: 1, stdout: '' });
    const { exec } = fakeExec({ lsof: noMatches });
    const result = await darwin.createDarwinAdapter({ native: null, exec, isRoot: true }).listeningPorts();
    assert.deepEqual(result, { items: [], partial: false });
});

test('adapter surfaces a missing tool as a PlatformError', async () => {
    const missing = Object.assign(new Error('spawn lsof ENOENT'), { code: 'ENOENT' });
    const { exec } = fakeExec({ lsof: missing });
    await assert.rejects(
        () => darwin.createDarwinAdapter({ native: null, exec }).listeningPorts(),
        (err) => err.name === 'PlatformError' && err.code === 'ENOTOOL' && /lsof/.test(err.message)
    );
});

test('adapter exposes per-core CPU times and load average from os', () => {
    const adapter = darwin.createDarwinAdapter({ native: null, exec: async () => ({ stdout: '' }) });
    const cores = adapter.cpuTimes();
    assert.ok(cores.length > 0);
    assert.equal(typeof cores[0].idle, 'number');
    assert.equal(adapter.loadAverage().length, 3);
    assert.equal(adapter.id, 'darwin');
});

test('the adapter samples natively when the native layer loads, with nanosecond cpu time', async () => {
    const native = {
        listPids: () => [100],
        taskInfo: () => ({ ppid: 1, uid: 501, status: 2, running: 0, startSec: 1, startUsec: 0, rssBytes: 1024, cpuNs: 5 }),
        shortInfo: () => null,
        comm: () => 'node',
        path: () => '/usr/local/bin/node',
        userName: () => 'alice',
    };
    const exec = async () => {
        throw new Error('ps must not run when every process is ours');
    };
    const adapter = darwin.createDarwinAdapter({ native, exec });
    assert.equal(adapter.sampling, 'native');
    assert.equal(adapter.clockTicks, 1e9);
    assert.deepEqual((await adapter.listProcesses()).map((p) => [p.pid, p.cpuTicks]), [[100, 5]]);
    assert.equal(darwin.createDarwinAdapter({ native: null, exec }).sampling, 'ps');
});

test('KESTREL_NATIVE=0 forces the ps/lsof path (a troubleshooting switch)', () => {
    const before = process.env.KESTREL_NATIVE;
    process.env.KESTREL_NATIVE = '0';
    try {
        assert.equal(darwin.createDarwinAdapter({ exec: async () => ({ stdout: '' }) }).sampling, 'ps');
    } finally {
        if (before === undefined) delete process.env.KESTREL_NATIVE;
        else process.env.KESTREL_NATIVE = before;
    }
});
