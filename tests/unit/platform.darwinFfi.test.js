// The real native layer against the real system tools (M4). Only meaningful under Bun on macOS
// (`npm run test:bun`); under Node, or on Linux, these tests pass without checking anything.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { loadDarwinNative } = require('../../core/platform/darwinFfi');
const darwin = require('../../core/platform/darwin');

const native = process.platform === 'darwin' && process.versions.bun ? loadDarwinNative() : null;
const onMac = (name, fn) => test(`${name} (Bun on macOS only)`, () => (native ? fn() : undefined));
const sh = (file, args) => execFileSync(file, args, { encoding: 'utf-8' });

onMac('the native layer loads and its self-check passes', () => {
    const self = native.taskInfo(process.pid);
    assert.equal(self.ppid, process.ppid);
    assert.equal(self.uid, process.getuid());
    assert.match(native.path(process.pid), /bun/);
    assert.equal(native.userName(process.getuid()), sh('id', ['-un']).trim());
});

onMac('it sees the same processes as ps', () => {
    const psPids = new Set(sh('ps', ['-A', '-o', 'pid=']).split('\n').filter(Boolean).map(Number));
    const nativePids = new Set(native.listPids());
    const common = [...psPids].filter((pid) => nativePids.has(pid)).length;
    assert.ok(common >= psPids.size * 0.95, `${common} of ${psPids.size} ps pids`);
});

onMac('its figures for our own process match ps', () => {
    const [ppid, rssKB] = sh('ps', ['-o', 'ppid=,rss=', '-p', String(process.pid)]).trim().split(/\s+/).map(Number);
    const self = native.taskInfo(process.pid);
    assert.equal(self.ppid, ppid);
    assert.ok(Math.abs(self.rssBytes / 1024 - rssKB) / rssKB < 0.25, `rss ${self.rssBytes / 1024} vs ${rssKB} KB`);
    assert.ok(self.cpuNs > 0);
});

onMac('it finds the same listening TCP sockets as lsof', async () => {
    const net = require('node:net');
    const server = net.createServer().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const { port } = server.address();
        assert.deepEqual(native.listeningSockets(process.pid), [{ port, address: '127.0.0.1' }]);
        // lsof -F: a `p<pid>` line starts a process, each `n<addr:port>` line is one of its sockets.
        const lsof = new Set();
        let owner = '';
        for (const line of sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']).split('\n')) {
            if (line[0] === 'p') owner = line.slice(1);
            else if (line[0] === 'n') lsof.add(`${owner}:${line.slice(1).split(':').pop()}`);
        }
        const ours = new Set(native.listPids().flatMap((pid) => native.listeningSockets(pid).map((s) => `${pid}:${s.port}`)));
        const missing = [...lsof].filter((key) => !ours.has(key));
        assert.deepEqual(missing, [], 'every socket lsof lists is found natively');
    } finally {
        server.close();
    }
});

onMac('memory matches vm_stat and sysctl', async () => {
    const viaTools = await darwin.createDarwinAdapter({ native: null }).memory();
    const viaNative = await darwin.createDarwinAdapter({ native }).memory();
    assert.equal(viaNative.totalMB, viaTools.totalMB);
    assert.equal(viaNative.swapTotalMB, viaTools.swapTotalMB);
    assert.ok(Math.abs(viaNative.usedMB - viaTools.usedMB) / viaTools.usedMB < 0.05, `used ${viaNative.usedMB} vs ${viaTools.usedMB} MB`);
});
