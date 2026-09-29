const { test } = require('node:test');
const assert = require('node:assert/strict');
const linux = require('../../core/platform/linux');
const { createFakeRoot, statLine, TCP_HEADER, BOOT_TIME_SEC } = require('../helpers/fakeProc');

const CLK = 100;
const PAGE = 4096;

// ---------- pure parsers ----------

test('parseProcStat splits at the last ")" so odd process names survive', () => {
    const tricky = linux.parseProcStat(statLine({ pid: 5, comm: '(sd-pam)', ppid: 4, utime: 7, stime: 3, starttime: 250, rssPages: 10 }));
    assert.deepEqual(tricky, { pid: 5, comm: '(sd-pam)', state: 'sleeping', ppid: 4, cpuTicks: 10, starttime: 250, rssPages: 10 });

    const spaced = linux.parseProcStat(statLine({ pid: 9, comm: 'tmux: server', state: 'R' }));
    assert.equal(spaced.comm, 'tmux: server');
    assert.equal(spaced.state, 'running');
    assert.equal(linux.parseProcStat('garbage'), null);
});

test('parseStatusUid reads the real uid', () => {
    assert.equal(linux.parseStatusUid('Name:\tx\nUid:\t1001\t1001\t1001\t1001\n'), 1001);
    assert.equal(linux.parseStatusUid('Name:\tx\n'), null);
});

test('parseCmdline turns NUL separators into spaces', () => {
    assert.equal(linux.parseCmdline('node\0server.js\0--port\x003000\0'), 'node server.js --port 3000');
    assert.equal(linux.parseCmdline(''), '');
});

test('parseMeminfo uses MemAvailable, with a fallback for old kernels', () => {
    const meminfo = 'MemTotal: 16384000 kB\nMemFree: 1024000 kB\nMemAvailable: 8192000 kB\nBuffers: 102400 kB\nCached: 4096000 kB\nSReclaimable: 1024 kB\nSwapTotal: 2048000 kB\nSwapFree: 1024000 kB\n';
    assert.deepEqual(linux.parseMeminfo(meminfo), { totalMB: 16000, usedMB: 8000, cachedMB: 4101, swapUsedMB: 1000, swapTotalMB: 2000 });

    const old = 'MemTotal: 2048000 kB\nMemFree: 512000 kB\nBuffers: 512000 kB\nCached: 0 kB\n';
    assert.deepEqual(linux.parseMeminfo(old), { totalMB: 2000, usedMB: 1000, cachedMB: 500, swapUsedMB: 0, swapTotalMB: 0 });
});

test('parsePasswd maps uid to user name', () => {
    const users = linux.parsePasswd('root:x:0:0:root:/root:/bin/bash\n# comment\nalice:x:1000:1000::/home/alice:/bin/sh\n');
    assert.equal(users.get(0), 'root');
    assert.equal(users.get(1000), 'alice');
});

test('parseBootTime reads btime from /proc/stat', () => {
    assert.equal(linux.parseBootTime('cpu 1 2 3\nbtime 1759000000\n'), 1759000000);
    assert.equal(linux.parseBootTime('cpu 1 2 3\n'), null);
});

test('parseSs reads listeners with and without owner info', () => {
    const out = [
        'LISTEN 0      511        127.0.0.1:3000      0.0.0.0:*    users:(("node",pid=812,fd=20))',
        'LISTEN 0      4096            [::]:22           [::]:*',
        'LISTEN 0      128                *:5173            *:*    users:(("node",pid=1190,fd=21),("node",pid=1191,fd=21))',
    ].join('\n');
    assert.deepEqual(linux.parseSs(out), [
        { port: 22, address: '::', proto: 'tcp', pid: null, name: null },
        { port: 3000, address: '127.0.0.1', proto: 'tcp', pid: 812, name: 'node' },
        { port: 5173, address: '*', proto: 'tcp', pid: 1190, name: 'node' },
    ]);
});

test('parseProcNetTcp keeps LISTEN sockets and decodes little-endian hex', () => {
    const v4 = `${TCP_HEADER}   0: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5555 1\n   1: 0100007F:9C40 0100007F:1538 01 00000000:00000000 00:00000000 00000000  1000        0 6666 1\n`;
    assert.deepEqual(linux.parseProcNetTcp(v4, false), [{ address: '127.0.0.1', port: 5432, inode: 5555 }]);

    const v6 = `${TCP_HEADER}   0: 00000000000000000000000001000000:14E5 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 7777 1\n`;
    assert.deepEqual(linux.parseProcNetTcp(v6, true), [{ address: '::1', port: 5349, inode: 7777 }]);
});

test('formatIpv6 compresses the longest run of zero groups', () => {
    assert.equal(linux.formatIpv6([0, 0, 0, 0, 0, 0, 0, 0]), '::');
    assert.equal(linux.formatIpv6([0, 0, 0, 0, 0, 0, 0, 1]), '::1');
    assert.equal(linux.formatIpv6([0xfe80, 0, 0, 0, 0x1, 0x2, 0x3, 0x4]), 'fe80::1:2:3:4');
});

// ---------- adapter against a fake /proc ----------

function withFakeRoot(spec, fn) {
    const fake = createFakeRoot(spec);
    return Promise.resolve(fn(fake)).finally(fake.cleanup);
}

const PROCESSES = [
    { pid: 1, comm: 'systemd', ppid: 0, uid: 0, cmdline: ['/sbin/init'], utime: 50, stime: 50, starttime: 10, rssPages: 1000 },
    { pid: 812, comm: 'node', ppid: 1, uid: 1000, cmdline: ['node', 'server.js'], utime: 300, stime: 100, starttime: 5000, rssPages: 25600, sockets: [5555] },
    { pid: 900, comm: 'kworker/0:1', ppid: 2, uid: 0 },
    { pid: 901, comm: 'gone', vanished: true },
];

test('adapter.listProcesses reads /proc, resolves users and skips vanished pids', () =>
    withFakeRoot({ processes: PROCESSES }, async ({ procRoot, etcRoot }) => {
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, clockTicks: CLK, pageSize: PAGE });
        const procs = await adapter.listProcesses();
        assert.deepEqual(procs.map((p) => p.pid), [1, 812, 900]);

        const node = procs.find((p) => p.pid === 812);
        assert.deepEqual(node, {
            pid: 812,
            ppid: 1,
            name: 'node',
            command: 'node server.js',
            user: 'alice',
            state: 'sleeping',
            rssKB: 102400,
            cpuTicks: 400,
            startedAt: (BOOT_TIME_SEC + 5000 / CLK) * 1000,
        });
        assert.equal(procs.find((p) => p.pid === 900).command, '[kworker/0:1]', 'kernel threads get a bracketed name');
        assert.equal(adapter.clockTicks, CLK);
    }));

test('per tick only stat is re-read: identity (user, command) is read once per process (M4 perf)', () =>
    withFakeRoot({ processes: PROCESSES }, async ({ procRoot, etcRoot }) => {
        const fs = require('node:fs');
        const path = require('node:path');
        const reads = [];
        const readText = (file, max) => {
            reads.push(path.relative(procRoot, file));
            return linux.readProcText(file, max);
        };
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, clockTicks: CLK, pageSize: PAGE, readText });
        await adapter.listProcesses();
        reads.length = 0;

        const [again] = [await adapter.listProcesses()];
        assert.deepEqual(reads.sort(), ['1/stat', '812/stat', '900/stat', '901/stat']);
        assert.equal(again.find((p) => p.pid === 812).command, 'node server.js');

        // pid 812 exits and the pid is reused by another program: its identity must be read again.
        fs.writeFileSync(path.join(procRoot, '812', 'stat'), statLine({ pid: 812, comm: 'python3', starttime: 9000 }));
        fs.writeFileSync(path.join(procRoot, '812', 'cmdline'), 'python3\0app.py\0');
        reads.length = 0;
        const reused = (await adapter.listProcesses()).find((p) => p.pid === 812);
        assert.ok(reads.includes('812/cmdline'));
        assert.equal(reused.command, 'python3 app.py');
    }));

test('readProcText reads small /proc files and treats vanished or forbidden ones as absent', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-rpt-'));
    try {
        fs.writeFileSync(path.join(dir, 'stat'), 'x'.repeat(20000));
        assert.equal(linux.readProcText(path.join(dir, 'stat')).length, 20000);
        assert.equal(linux.readProcText(path.join(dir, 'stat'), 100).length, 100);
        assert.equal(linux.readProcText(path.join(dir, 'missing')), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('adapter.listProcesses shows unknown uids as numbers', () =>
    withFakeRoot({ processes: [{ pid: 7, comm: 'x', uid: 4242 }] }, async ({ procRoot, etcRoot }) => {
        const [proc] = await linux.createLinuxAdapter({ procRoot, etcRoot, clockTicks: CLK, pageSize: PAGE }).listProcesses();
        assert.equal(proc.user, '4242');
    }));

test('adapter.memory reads /proc/meminfo', () =>
    withFakeRoot({ processes: [] }, async ({ procRoot, etcRoot }) => {
        const mem = await linux.createLinuxAdapter({ procRoot, etcRoot, clockTicks: CLK, pageSize: PAGE }).memory();
        assert.deepEqual(mem, { totalMB: 16000, usedMB: 8000, cachedMB: 0, swapUsedMB: 1000, swapTotalMB: 2000 });
    }));

test('adapter.listeningPorts prefers ss and marks partial when owners are hidden', () =>
    withFakeRoot({ processes: [] }, async ({ procRoot, etcRoot }) => {
        const exec = async () => ({ stdout: 'LISTEN 0 4096 [::]:22 [::]:*\n' });
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, exec, isRoot: false, clockTicks: CLK, pageSize: PAGE });
        assert.deepEqual(await adapter.listeningPorts(), {
            items: [{ port: 22, address: '::', proto: 'tcp', pid: null, name: null }],
            partial: true,
        });
    }));

test('adapter.listeningPorts falls back to /proc/net/tcp when ss is missing', () => {
    const tcp = `${TCP_HEADER}   0: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5555 1\n`;
    return withFakeRoot({ processes: PROCESSES, tcp }, async ({ procRoot, etcRoot }) => {
        const exec = async () => {
            throw Object.assign(new Error('spawn ss ENOENT'), { code: 'ENOENT' });
        };
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, exec, isRoot: true, clockTicks: CLK, pageSize: PAGE });
        assert.deepEqual(await adapter.listeningPorts(), {
            items: [{ port: 5432, address: '127.0.0.1', proto: 'tcp', pid: 812, name: 'node' }],
            partial: false,
        });
    });
});

test('adapter exposes os-level cpu times and load average', () => {
    const adapter = linux.createLinuxAdapter({ procRoot: '/nonexistent', clockTicks: CLK, pageSize: PAGE });
    assert.equal(adapter.id, 'linux');
    assert.ok(adapter.cpuTimes().length > 0, 'falls back to os.cpus() without /proc/stat');
    assert.equal(adapter.loadAverage().length, 3);
});

test('parseProcStatCpus reads per-core times; iowait counts as idle, softirq and steal as busy', () => {
    const text = 'cpu  10 1 20 300 5 2 3 4 0 0\ncpu0 6 1 10 150 5 1 2 4 0 0\ncpu1 4 0 10 150 0 1 1 0 0 0\nintr 123\n';
    assert.deepEqual(linux.parseProcStatCpus(text), [
        { user: 6, nice: 1, sys: 10, idle: 155, irq: 7 },
        { user: 4, nice: 0, sys: 10, idle: 150, irq: 2 },
    ]);
    assert.deepEqual(linux.parseProcStatCpus('cpu  1 2 3 4\n'), []);
});

test('cpuTimes reads /proc/stat instead of os.cpus() (which also parses cpuinfo and cpufreq every call)', () =>
    withFakeRoot({ processes: [] }, async ({ procRoot, etcRoot }) => {
        const fs = require('node:fs');
        const path = require('node:path');
        fs.writeFileSync(path.join(procRoot, 'stat'), 'cpu  2 0 2 8 0 0 0 0\ncpu0 1 0 1 4 0 0 0 0\ncpu1 1 0 1 4 0 0 0 0\nbtime 1\n');
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, clockTicks: CLK, pageSize: PAGE });
        assert.deepEqual(adapter.cpuTimes().map((c) => c.idle), [4, 4]);
    }));

test('a missing ss is detected once, and socket owners are not rescanned while nothing changes', () => {
    const tcp = `${TCP_HEADER}   0: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5555 1\n`;
    return withFakeRoot({ processes: PROCESSES, tcp }, async ({ procRoot, etcRoot }) => {
        let ssCalls = 0;
        const exec = async () => {
            ssCalls += 1;
            throw Object.assign(new Error('spawn ss ENOENT'), { code: 'ENOENT' });
        };
        const real = require('node:fs/promises');
        let readlinks = 0;
        const fs = {
            ...real,
            readlink: (...a) => {
                readlinks += 1;
                return real.readlink(...a);
            },
        };
        const adapter = linux.createLinuxAdapter({ procRoot, etcRoot, fs, exec, isRoot: true, clockTicks: CLK, pageSize: PAGE });
        await adapter.listeningPorts();
        const scanned = readlinks;
        const again = await adapter.listeningPorts();
        assert.equal(ssCalls, 1);
        assert.equal(readlinks, scanned, 'the known owner of inode 5555 is reused');
        assert.equal(again.items[0].pid, 812);
    });
});

test('readSysconf returns the fallback when getconf is unavailable', () => {
    const failing = () => {
        throw new Error('no getconf');
    };
    assert.equal(linux.readSysconf('CLK_TCK', 100, failing), 100);
    assert.equal(linux.readSysconf('CLK_TCK', 100, () => '250\n'), 250);
});

// ---------- real kernel output (refresh with scripts/capture-linux-fixtures.sh) ----------

const fs = require('node:fs');
const path = require('node:path');
const CAPTURED = path.join(__dirname, '..', 'fixtures', 'linux', 'captured');
const captured = (name) => fs.readFileSync(path.join(CAPTURED, name), 'utf-8');

test('parsers read genuine /proc output captured from a Linux container', () => {
    const listenerPid = Number(captured('listener_pid.txt').trim());
    const stat = linux.parseProcStat(captured('pid_stat.txt'));
    assert.equal(stat.pid, listenerPid);
    assert.equal(stat.comm, 'node');
    assert.equal(stat.state, 'sleeping');
    assert.ok(Number.isInteger(stat.cpuTicks) && stat.cpuTicks >= 0);
    assert.ok(stat.starttime > 0 && stat.rssPages > 0);

    assert.equal(typeof linux.parseStatusUid(captured('pid_status.txt')), 'number');
    assert.match(linux.parseCmdline(captured('pid_cmdline.txt').replace(/\n/g, '\0')), /^node -e /);
    assert.ok(linux.parseBootTime(captured('proc_stat.txt')) > 1e9);

    const mem = linux.parseMeminfo(captured('meminfo.txt'));
    assert.ok(mem.totalMB > 0 && mem.usedMB > 0 && mem.usedMB < mem.totalMB);

    const listeners = linux.parseProcNetTcp(captured('net_tcp.txt'), false);
    assert.ok(listeners.some((l) => l.address === '127.0.0.1' && l.port === 5432 && l.inode > 0));
    assert.ok(Array.isArray(linux.parseProcNetTcp(captured('net_tcp6.txt'), true)));
});
