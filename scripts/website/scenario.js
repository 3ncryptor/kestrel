// The story the website hero plays: 30 seconds on a developer's Mac running the "myapp" stack. Every
// value is deterministic (a fixed clock and a seeded generator), so regenerating gives identical frames.
//
//   ticks 0-11   everything ready; the api serves requests and its memory creeps up
//   tick  12     worker crashes (a real bug in its job handler); Kestrel logs it and schedules a restart
//   ticks 12-15  ↻ retry 1 in 4s … 1s
//   ticks 16-17  ◌ starting
//   ticks 18-29  ● ready again

const EPOCH = Date.UTC(2026, 8, 29, 9, 41, 0);
const TICKS = 30;
/** System samples before tick 0, so the CPU graph is already full on the first frame. */
const PREFILL = 120;
const CORES = 8;
const CRASH_AT = 12;
const RETRY_MS = 4000;
const STARTING_AT = CRASH_AT + 4;
const READY_AT = CRASH_AT + 6;
const USER = 'dev';
const HOME = '/Users/dev/code/myapp';

const PIDS = Object.freeze({ db: 4101, api: 4102, worker: 4103, workerRestarted: 4190, cron: 4104, zsh: 3021, kestrel: 3050 });

const clock = (t) => EPOCH + t * 1000;

function seeded(seed) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
    };
}

/** The rest of the machine: a browser, an editor, the system. Most processes idle, as on a real Mac. */
const BACKGROUND = (() => {
    const random = seeded(11);
    const names = [
        ['Google Chrome Helper (Renderer)', '/Applications/Google Chrome.app/Contents/Frameworks/Helper'],
        ['Code Helper (Plugin)', '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper'],
        ['Slack Helper', '/Applications/Slack.app/Contents/Frameworks/Slack Helper'],
        ['mds_stores', '/System/Library/Frameworks/CoreServices.framework/mds_stores'],
        ['Spotlight', '/System/Library/CoreServices/Spotlight.app/Contents/MacOS/Spotlight'],
        ['cloudd', '/System/Library/PrivateFrameworks/CloudKitDaemon.framework/cloudd'],
        ['bird', '/System/Library/PrivateFrameworks/CloudDocsDaemon.framework/bird'],
        ['trustd', '/usr/libexec/trustd'],
    ];
    return Array.from({ length: 180 }, (_, i) => {
        const [name, command] = names[i % names.length];
        return { pid: 500 + i * 7, ppid: 1, name, command, user: i % 5 ? USER : 'root', idle: random() > 0.18, weight: random() };
    });
})();

function systemAt(t) {
    const wave = Math.sin((t + PREFILL) / 4) * 9 + Math.sin((t + PREFILL) / 1.7) * 4;
    const spike = t >= CRASH_AT && t < READY_AT ? 6 : 0;
    const cpuPercent = Math.round(24 + wave + spike);
    const cores = Array.from({ length: CORES }, (_, i) => {
        const v = cpuPercent + Math.sin((t + PREFILL) * (0.6 + i * 0.23) + i) * (18 - i);
        return Math.max(1, Math.min(97, Math.round(v)));
    });
    return {
        cpuPercent, cores, load: [2.4, 2.1, 1.9],
        memUsedMB: 9830 + ((t + PREFILL) % 7) * 11, memTotalMB: 16384, memCachedMB: 3174,
        swapUsedMB: 256, swapTotalMB: 2048, uptimeSec: 3 * 86400 + 4 * 3600 + 37 * 60 + t,
    };
}

function workerPid(t) {
    if (t < CRASH_AT) return PIDS.worker;
    return t >= STARTING_AT ? PIDS.workerRestarted : null;
}

function processesAt(t) {
    const random = seeded(101 + t);
    const background = BACKGROUND.map((p) => ({
        pid: p.pid, ppid: p.ppid, name: p.name, command: p.command, user: p.user, state: p.idle ? 'sleeping' : 'running',
        startedAt: EPOCH - 86400_000, cpu: p.idle ? 0 : Math.round(random() * p.weight * 90) / 10, memMB: Math.round(40 + p.weight * 420),
    }));
    const own = [
        { pid: 1, ppid: 0, name: 'launchd', command: '/sbin/launchd', user: 'root', cpu: 0.1, memMB: 34 },
        { pid: 402, ppid: 1, name: 'WindowServer', command: '/System/Library/PrivateFrameworks/SkyLight.framework/WindowServer', user: '_windowserver', cpu: 6.4 + (t % 3), memMB: 412 },
        { pid: 461, ppid: 1, name: 'Google Chrome Helper (GPU)', command: '/Applications/Google Chrome.app/Contents/Frameworks/Helper (GPU)', user: USER, cpu: 11.2 + (t % 4), memMB: 688 },
        { pid: PIDS.zsh, ppid: 1, name: 'zsh', command: '/bin/zsh -l', user: USER, cpu: 0, memMB: 6 },
        { pid: PIDS.kestrel, ppid: PIDS.zsh, name: 'kestrel', command: 'kestrel pm', user: USER, cpu: 2.9, memMB: 78 },
        { pid: PIDS.db, ppid: PIDS.kestrel, name: 'postgres', command: 'postgres -D /usr/local/var/postgres', user: USER, cpu: 1.2 + (t % 2) * 0.6, memMB: 212 },
        // The api's memory creeps up: the story the pitch tells ("holding 1.2 GB and climbing").
        { pid: PIDS.api, ppid: PIDS.kestrel, name: 'node', command: 'node --watch src/server.js', user: USER, cpu: 8.4 + (t % 5) * 1.3, memMB: 1180 + t * 3 },
        { pid: PIDS.cron, ppid: PIDS.kestrel, name: 'node', command: 'node cron.js', user: USER, cpu: 0.3, memMB: 64 },
    ];
    const worker = workerPid(t);
    if (worker) own.push({ pid: worker, ppid: PIDS.kestrel, name: 'node', command: 'node worker.js', user: USER, cpu: t < READY_AT && t >= STARTING_AT ? 34.5 : 4.1 + (t % 3), memMB: 146 });
    return [...own.map((p) => ({ state: p.cpu > 1 ? 'running' : 'sleeping', startedAt: EPOCH - 3 * 3600_000, ...p })), ...background];
}

const PORTS = Object.freeze({
    items: [
        { port: 3000, address: '127.0.0.1', proto: 'tcp', pid: PIDS.api, name: 'node' },
        { port: 5432, address: '*', proto: 'tcp', pid: PIDS.db, name: 'postgres' },
    ],
    partial: false,
});

const STACK = Object.freeze({ name: 'myapp', source: 'kestrel.json', path: `${HOME}/kestrel.json`, errors: [], scripts: null });

const WORKER_READY = { kind: 'log', target: 'worker ready' };

function workerAt(t, base) {
    const worker = { ...base, id: 'worker', cmd: 'node worker.js', dependsOn: ['api'] };
    if (t < CRASH_AT) return { ...worker, status: 'running', pid: PIDS.worker, startedAt: EPOCH - 2 * 3600_000, ready: { ...WORKER_READY, ok: true } };
    const restarted = { restartCount: 1, ready: { ...WORKER_READY, ok: t >= READY_AT } };
    if (t < STARTING_AT) return { ...worker, ...restarted, status: 'restarting', pid: null, exitCode: 1, nextRestartAt: clock(CRASH_AT) + RETRY_MS };
    return { ...worker, ...restarted, status: t < READY_AT ? 'starting' : 'running', pid: PIDS.workerRestarted, startedAt: clock(STARTING_AT) };
}

function managedAt(t) {
    const base = {
        cwd: HOME, restart: 'on-failure', blockedBy: [], exitCode: null, signal: null, nextRestartAt: null, restartCount: 0,
        logCount: 0, resources: null, memHistory: [], leakSuspect: false,
    };
    const since = EPOCH - 3 * 3600_000;
    return [
        { ...base, id: 'db', cmd: 'postgres -D /usr/local/var/postgres', dependsOn: [], status: 'running', pid: PIDS.db, startedAt: since, ready: { kind: 'port', target: 5432, ok: true } },
        { ...base, id: 'api', cmd: 'node --watch src/server.js', dependsOn: ['db'], status: 'running', pid: PIDS.api, startedAt: since, ready: { kind: 'port', target: 3000, ok: true } },
        workerAt(t, base),
        { ...base, id: 'cron', cmd: 'node cron.js', dependsOn: ['db'], status: 'running', pid: PIDS.cron, startedAt: since, ready: null, restart: 'always' },
    ];
}

const REQUESTS = [
    'GET /api/projects 200 18ms', 'GET /health 200 1ms', 'POST /api/login 200 42ms', 'GET /api/projects/42 200 11ms',
    'GET /api/users/me 200 7ms', 'POST /api/jobs 202 9ms', 'GET /api/projects?page=2 200 23ms', 'PATCH /api/projects/42 200 31ms',
    'POST /api/login 401 9ms', 'GET /health 200 1ms', 'GET /api/search?q=kestrel 200 64ms', 'DELETE /api/sessions/17 204 5ms',
];

/** Every log line of the 30 seconds (and a little history before), in order. */
const LOGS = (() => {
    const lines = { db: [], api: [], worker: [], cron: [] };
    let seq = 0;
    const add = (id, t, text, stream = 'stdout', offsetMs = 0) => lines[id].push({ seq: ++seq, ts: clock(t) + offsetMs, stream, text });
    add('db', -40, 'LOG:  database system is ready to accept connections');
    add('api', -38, 'api listening on http://localhost:3000');
    add('worker', -36, 'worker ready: polling queue "default"');
    add('cron', -35, 'scheduled: cleanup-sessions (every 5m)');
    add('api', -20, '(node:4102) DeprecationWarning: The `punycode` module is deprecated.', 'stderr');
    for (let t = -6; t < TICKS; t++) {
        add('api', t, REQUESTS[(t + 12) % REQUESTS.length], 'stdout', 180);
        if ((t + 12) % 3 === 0) add('api', t, REQUESTS[(t + 17) % REQUESTS.length], 'stdout', 620);
        if (t >= 0 && t < CRASH_AT && t % 4 === 1) add('worker', t, `job ${1180 + t} done (send-welcome-email) 212ms`, 'stdout', 400);
    }
    add('worker', CRASH_AT, "TypeError: Cannot read properties of undefined (reading 'email')", 'stderr', 90);
    add('worker', CRASH_AT, '    at sendWelcome (src/jobs/welcome.js:18:31)', 'stderr', 95);
    add('worker', CRASH_AT, '[kestrel] crashed (code 1, signal null)', 'system', 120);
    add('worker', STARTING_AT, 'worker booting (attempt 2)', 'stdout', 300);
    add('worker', READY_AT, 'worker ready: polling queue "default"', 'stdout', 200);
    add('cron', 20, 'cleanup-sessions: removed 12 expired sessions', 'stdout', 500);
    return lines;
})();

/** The log lines each process had written by the end of tick `t` (what getLogs returns). */
function logsAt(t) {
    const until = clock(t) + 999;
    return Object.fromEntries(Object.entries(LOGS).map(([id, lines]) => [id, lines.filter((l) => l.ts <= until)]));
}

module.exports = {
    EPOCH, TICKS, PREFILL, CRASH_AT, READY_AT, PIDS, STACK, PORTS, USER,
    clock, systemAt, processesAt, managedAt, logsAt,
    META: Object.freeze({ version: require('../../package.json').version, hostname: 'macbook-pro', platform: 'darwin', arch: 'arm64' }),
};
