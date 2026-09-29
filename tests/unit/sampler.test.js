const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cpuBusy, processCpu } = require('../../core/sampler/cpu');
const { pushBounded } = require('../../core/sampler/ring');
const { regression, nextLeakState, LEAK_DEFAULTS } = require('../../core/sampler/leak');
const { createSampler } = require('../../core/sampler');

const core = (busy, idle) => ({ user: busy, nice: 0, sys: 0, idle, irq: 0 });

// ---------- cpu ----------

test('cpuBusy returns null until there is a previous reading', () => {
    assert.equal(cpuBusy(null, [core(10, 90)]), null);
});

test('cpuBusy computes per-core and total busy % from deltas', () => {
    const prev = [core(100, 900), core(100, 900)];
    const curr = [core(150, 950), core(200, 900)]; // core0: 50/100 busy, core1: 100/100 busy
    assert.deepEqual(cpuBusy(prev, curr), { total: 75, cores: [50, 100] });
});

test('cpuBusy treats an idle interval (no elapsed time) as 0% and a core-count change as a reset', () => {
    assert.deepEqual(cpuBusy([core(1, 1)], [core(1, 1)]), { total: 0, cores: [0] });
    assert.equal(cpuBusy([core(1, 1)], [core(1, 1), core(2, 2)]), null);
});

const baseProc = { ppid: 1, name: 'node', command: 'node a.js', user: 'alice', state: 'running', startedAt: 1000 };

test('processCpu passes through ps-reported percentages (macOS)', () => {
    const { processes } = processCpu({ procs: [{ ...baseProc, pid: 7, rssKB: 2048, cpuPercent: 12.5 }], prevTicks: new Map(), elapsedMs: 1000, clockTicks: 100 });
    assert.deepEqual(processes[0], { ...baseProc, pid: 7, cpu: 12.5, memMB: 2 });
});

test('processCpu turns Linux tick deltas into a percentage of one core', () => {
    const first = processCpu({ procs: [{ ...baseProc, pid: 7, rssKB: 1024, cpuTicks: 1000 }], prevTicks: new Map(), elapsedMs: 1000, clockTicks: 100 });
    assert.equal(first.processes[0].cpu, 0, 'no baseline yet');

    // 50 ticks at 100 Hz = 0.5 s of CPU within a 1 s window = 50 %
    const second = processCpu({ procs: [{ ...baseProc, pid: 7, rssKB: 1024, cpuTicks: 1050 }], prevTicks: first.ticks, elapsedMs: 1000, clockTicks: 100 });
    assert.equal(second.processes[0].cpu, 50);
});

test('processCpu ignores a baseline from a different process that reused the pid', () => {
    const first = processCpu({ procs: [{ ...baseProc, pid: 7, rssKB: 0, cpuTicks: 10 }], prevTicks: new Map(), elapsedMs: 1000, clockTicks: 100 });
    const reused = processCpu({ procs: [{ ...baseProc, pid: 7, startedAt: 9999, rssKB: 0, cpuTicks: 5000 }], prevTicks: first.ticks, elapsedMs: 1000, clockTicks: 100 });
    assert.equal(reused.processes[0].cpu, 0);
});

test('processCpu drops baselines for processes that exited', () => {
    const first = processCpu({ procs: [{ ...baseProc, pid: 7, rssKB: 0, cpuTicks: 10 }], prevTicks: new Map(), elapsedMs: 1000, clockTicks: 100 });
    const second = processCpu({ procs: [], prevTicks: first.ticks, elapsedMs: 1000, clockTicks: 100 });
    assert.equal(second.ticks.size, 0);
});

// ---------- ring ----------

test('pushBounded returns a new array capped at capacity', () => {
    const a = [1, 2, 3];
    const b = pushBounded(a, 4, 3);
    assert.deepEqual(b, [2, 3, 4]);
    assert.deepEqual(a, [1, 2, 3], 'input is not mutated');
    assert.deepEqual(pushBounded([], 1, 3), [1]);
});

// ---------- leak detector ----------

const MINUTE = 60000;
const series = (n, fn) => Array.from({ length: n }, (_, i) => ({ at: i * 5000, value: fn(i) }));

test('regression fits slope and r² of a perfect line', () => {
    const { slope, r2 } = regression([{ at: 0, value: 1 }, { at: 1, value: 3 }, { at: 2, value: 5 }]);
    assert.equal(slope, 2);
    assert.equal(r2, 1);
});

test('nextLeakState flags steady growth (≥1 MB/min, r² ≥ 0.8, ≥20% over ≥120 samples)', () => {
    const growing = series(120, (i) => 200 + i * 0.5); // +6 MB/min, ~30% over 10 min
    const state = nextLeakState({ suspect: false, lastMatchAt: null }, growing, 10 * MINUTE);
    assert.equal(state.suspect, true);
});

test('nextLeakState ignores flat, noisy or short series', () => {
    const idle = { suspect: false, lastMatchAt: null };
    assert.equal(nextLeakState(idle, series(120, () => 300), 0).suspect, false, 'flat');
    assert.equal(nextLeakState(idle, series(120, (i) => (i % 2 ? 100 : 400)), 0).suspect, false, 'noisy');
    assert.equal(nextLeakState(idle, series(60, (i) => 200 + i), 0).suspect, false, 'too few samples');
});

test('nextLeakState holds the flag for the hold period before clearing (no flicker)', () => {
    const flat = series(120, () => 300);
    const flagged = { suspect: true, lastMatchAt: 0 };
    assert.equal(nextLeakState(flagged, flat, LEAK_DEFAULTS.holdMs - 1).suspect, true);
    assert.equal(nextLeakState(flagged, flat, LEAK_DEFAULTS.holdMs).suspect, false);
});

// ---------- sampler loop ----------

function fakePlatform(overrides = {}) {
    let idle = 0;
    return {
        id: 'darwin',
        cpuTimes: () => {
            idle += 100;
            return [core(0, idle)];
        },
        loadAverage: () => [1, 2, 3],
        listProcesses: async () => [{ ...baseProc, pid: 7, rssKB: 1024, cpuPercent: 1 }],
        memory: async () => ({ totalMB: 1000, usedMB: 500, swapUsedMB: 0 }),
        listeningPorts: async () => ({ items: [], partial: false }),
        ...overrides,
    };
}

function fakeSink({ fastPorts = false } = {}) {
    const calls = { system: [], processes: [], ports: [], errors: [], cleared: [], managedMem: [] };
    return {
        calls,
        setSystem: (s) => calls.system.push(s),
        setProcesses: (p) => calls.processes.push(p),
        setPorts: (p) => calls.ports.push(p),
        reportError: (source, err) => calls.errors.push([source, err.message]),
        clearError: (source) => calls.cleared.push(source),
        sampleManagedMemory: (at) => calls.managedMem.push(at),
        prefersFastPorts: () => fastPorts,
    };
}

function fakeClock() {
    let now = 0;
    return { now: () => now, advance: (ms) => (now += ms), setInterval: () => 1, clearInterval: () => {} };
}

test('sampler tick publishes system stats, processes and first-tick ports', async () => {
    const sink = fakeSink();
    const sampler = createSampler({ platform: fakePlatform(), sink, clock: fakeClock(), uptime: () => 42 });
    await sampler.tick();
    assert.equal(sink.calls.system[0].cpuPercent, null, 'first tick has no CPU baseline');
    assert.equal(sink.calls.system[0].memUsedMB, 500);
    assert.equal(sink.calls.system[0].uptimeSec, 42);
    assert.equal(sink.calls.processes[0][0].pid, 7);
    assert.equal(sink.calls.ports.length, 1);
    assert.equal(sink.calls.managedMem.length, 1);
});

test('sampler samples ports and managed memory on their own cadence', async () => {
    const clock = fakeClock();
    const sink = fakeSink();
    const sampler = createSampler({ platform: fakePlatform(), sink, clock, uptime: () => 0 });
    for (let i = 0; i < 6; i++) {
        await sampler.tick();
        clock.advance(1000);
    }
    assert.equal(sink.calls.system.length, 6);
    assert.equal(sink.calls.system[1].cpuPercent, 0, 'second tick has a baseline');
    assert.equal(sink.calls.ports.length, 2, 'ports every 5 s');
    assert.equal(sink.calls.managedMem.length, 2, 'managed memory every 5 s');
});

test('sampler polls ports every tick while the Ports view is open', async () => {
    const clock = fakeClock();
    const sink = fakeSink({ fastPorts: true });
    const sampler = createSampler({ platform: fakePlatform(), sink, clock, uptime: () => 0 });
    for (let i = 0; i < 3; i++) {
        await sampler.tick();
        clock.advance(1000);
    }
    assert.equal(sink.calls.ports.length, 3);
});

test('a failing source is reported without stopping the others, and cleared on recovery', async () => {
    let fail = true;
    const platform = fakePlatform({
        listeningPorts: async () => {
            if (fail) throw new Error('lsof not found on this system');
            return { items: [], partial: false };
        },
    });
    const clock = fakeClock();
    const sink = fakeSink({ fastPorts: true });
    const sampler = createSampler({ platform, sink, clock, uptime: () => 0 });
    await sampler.tick();
    assert.deepEqual(sink.calls.errors, [['ports', 'lsof not found on this system']]);
    assert.equal(sink.calls.system.length, 1, 'system stats still published');

    fail = false;
    clock.advance(1000);
    await sampler.tick();
    assert.ok(sink.calls.cleared.includes('ports'));
});

test('overlapping ticks are skipped while one is in flight', async () => {
    let release;
    const platform = fakePlatform({ listProcesses: () => new Promise((resolve) => (release = () => resolve([]))) });
    const sink = fakeSink();
    const sampler = createSampler({ platform, sink, clock: fakeClock(), uptime: () => 0 });
    const first = sampler.tick();
    await sampler.tick(); // returns immediately
    release();
    await first;
    assert.equal(sink.calls.system.length, 1);
});

test('start() ticks immediately and schedules; stop() cancels', async () => {
    const scheduled = [];
    const clock = {
        now: () => 0,
        setInterval: (_fn, ms) => {
            scheduled.push(ms);
            return 'timer';
        },
        clearInterval: (t) => scheduled.push(`clear:${t}`),
    };
    const sink = fakeSink();
    const sampler = createSampler({ platform: fakePlatform(), sink, clock, intervalMs: 250, uptime: () => 0 });
    sampler.start();
    sampler.start(); // idempotent
    await new Promise((r) => setImmediate(r));
    sampler.stop();
    assert.deepEqual(scheduled, [250, 'clear:timer']);
    assert.equal(sink.calls.system.length, 1);
});

test('an explicitly undefined interval falls back to the default (regression: it meant setInterval(fn, undefined) ≈ 1 ms)', () => {
    const scheduled = [];
    const clock = {
        now: () => 0,
        setInterval: (_fn, ms) => {
            scheduled.push(ms);
            return 'timer';
        },
        clearInterval: () => {},
    };
    const sampler = createSampler({ platform: fakePlatform(), sink: fakeSink(), clock, uptime: () => 0, intervalMs: undefined, portsSlowMs: undefined });
    sampler.start();
    sampler.stop();
    assert.deepEqual(scheduled, [1000]);
});
