#!/usr/bin/env node
// Engine performance check (BUILD_PLAN §11). Runs the real sampler against this machine and reports
// Kestrel's CPU INCLUDING the processes it spawns (ps, lsof…), its memory, the tick cost and store
// change events per second. The interactive UI needs a PTY and is measured as described in docs/DEV.md.
//
//   node scripts/bench.js [seconds=30]          bun scripts/bench.js 60
//
// Why a child shell: process.cpuUsage() only sees this process, and before M4 most of the cost was in
// the ps/lsof children it spawned (a 1.5% "engine" was really ~5%). Each measurement runs in
// `sh -c '<runtime> bench.js --engine N; times'`: the shell's `times` reports the CPU of every descendant
// it waited for, children included. A run with a 0 s window measures start-up alone and is subtracted.
const { spawnSync } = require('node:child_process');

// The product target (PRD §7, all of Kestrel's CPU, children included) is reported; CI fails only
// above the regression guard, set above today's measurements (BUILD_PLAN §11.3). The target is
// deferred while shipping comes first (decision 2026-09-29).
const TARGET = { cpuPercent: 1, rssMB: 80 };
const GUARD = { cpuPercent: Number(process.env.KESTREL_BENCH_MAX_CPU || 4), rssMB: 120 };
const TICK_SAMPLES = 10;

// ---------- engine mode: runs inside the measured shell ----------

async function engine(seconds) {
    const { createKestrel } = require('../core');
    const kestrel = createKestrel();
    const times = [];
    for (let i = 0; i < TICK_SAMPLES; i++) {
        const t = performance.now();
        await kestrel.tick();
        times.push(performance.now() - t);
    }
    let changes = 0;
    kestrel.store.on('change', () => changes++);
    const self0 = process.cpuUsage();
    const wall0 = Date.now();
    if (seconds > 0) {
        kestrel.start();
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
    const self = process.cpuUsage(self0);
    const wall = (Date.now() - wall0) / 1000;
    await kestrel.stop();
    process.stdout.write(`${JSON.stringify({
        wall,
        selfCpuSec: (self.user + self.system) / 1e6,
        processes: kestrel.store.getState().processes.length,
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
        tickMedianMs: times.sort((a, b) => a - b)[Math.floor(TICK_SAMPLES / 2)],
        changesPerSecond: wall > 0 ? changes / wall : 0,
    })}\n`);
}

// ---------- parent mode ----------

const seconds = (text) => {
    const m = /(\d+)m([\d.]+)s/.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Runs the engine for `window` s in a shell; returns its report plus the CPU of it and its children. */
function measure(window) {
    const script = '"$0" "$1" --engine "$2"; times';
    const run = spawnSync('sh', ['-c', script, process.execPath, __filename, String(window)], { encoding: 'utf-8' });
    const lines = run.stdout.trim().split('\n');
    const [user, sys] = lines[lines.length - 1].trim().split(/\s+/).map(seconds); // children of the shell
    if (run.status !== 0 || Number.isNaN(user + sys)) throw new Error(`measurement failed: ${run.stderr || run.stdout}`);
    return { ...JSON.parse(lines[lines.length - 3]), totalCpuSec: user + sys };
}

function main() {
    const window = Number(process.argv[2] || 30);
    const baseline = measure(0);
    const run = measure(window);
    const cpuPercent = ((run.totalCpuSec - baseline.totalCpuSec) / run.wall) * 100;
    const enginePercent = (run.selfCpuSec / run.wall) * 100;
    const report = {
        runtime: process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`,
        platform: `${process.platform}-${process.arch}`,
        seconds: +run.wall.toFixed(1),
        processes: run.processes,
        cpuPercent: +cpuPercent.toFixed(2),
        engineCpuPercent: +enginePercent.toFixed(2),
        childrenCpuPercent: +Math.max(0, cpuPercent - enginePercent).toFixed(2),
        rssMB: run.rssMB,
        tickMedianMs: +run.tickMedianMs.toFixed(1),
        changesPerSecond: +run.changesPerSecond.toFixed(1),
        target: TARGET,
        guard: GUARD,
    };
    report.withinTarget = report.cpuPercent < TARGET.cpuPercent && report.rssMB < TARGET.rssMB;
    report.withinGuard = report.cpuPercent < GUARD.cpuPercent && report.rssMB < GUARD.rssMB;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.withinGuard ? 0 : 1;
}

if (process.argv[2] === '--engine') {
    engine(Number(process.argv[3])).then(() => process.exit(0));
} else {
    process.exitCode = main();
}
