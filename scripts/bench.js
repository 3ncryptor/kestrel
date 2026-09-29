#!/usr/bin/env node
// Engine performance check (BUILD_PLAN §11). Runs the real sampler against this machine for a window
// and reports Kestrel's own CPU and memory, the tick cost, and store change events per second.
// The full interactive UI needs a PTY and is measured as described in docs/DEV.md.
//
//   node scripts/bench.js [seconds=30]          bun scripts/bench.js 60
const { createKestrel } = require('../core');

const BUDGET = { cpuPercent: 1, rssMB: 80 }; // PRD §7
const seconds = Number(process.argv[2] || 30);

async function measureTick(kestrel, samples = 10) {
    const times = [];
    for (let i = 0; i < samples; i++) {
        const t = performance.now();
        await kestrel.tick();
        times.push(performance.now() - t);
    }
    return times.sort((a, b) => a - b)[Math.floor(samples / 2)];
}

async function main() {
    const kestrel = createKestrel();
    let changes = 0;
    kestrel.store.on('change', () => changes++);
    const tickMedianMs = await measureTick(kestrel);

    changes = 0;
    kestrel.start();
    const cpuStart = process.cpuUsage();
    const wallStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const cpu = process.cpuUsage(cpuStart);
    const wall = (Date.now() - wallStart) / 1000;
    await kestrel.stop();

    const report = {
        runtime: process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`,
        platform: `${process.platform}-${process.arch}`,
        seconds: wall,
        processes: kestrel.store.getState().processes.length,
        engineCpuPercent: +(((cpu.user + cpu.system) / 1e6 / wall) * 100).toFixed(2),
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
        tickMedianMs: +tickMedianMs.toFixed(1),
        changesPerSecond: +(changes / wall).toFixed(1),
        budget: BUDGET,
    };
    report.withinBudget = report.engineCpuPercent < BUDGET.cpuPercent && report.rssMB < BUDGET.rssMB;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.withinBudget ? 0 : 1;
}

main().then((code) => process.exit(code));
