#!/usr/bin/env node
// Test fixture for the process manager: logs periodically, then crashes.
//
//   --interval <ms>     time between log lines          (default 500)
//   --crash-after <ms>  exit after this long            (default: random 3–8 s)
//   --exit-code <n>     exit code used when exiting     (default 1)
//   --stderr            write every other line to stderr

const MIN_CRASH_MS = 3000;
const MAX_CRASH_MS = 8000;

function readArg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : fallback;
}

const intervalMs = readArg('--interval', 500);
const crashAfterMs = readArg('--crash-after', MIN_CRASH_MS + Math.random() * (MAX_CRASH_MS - MIN_CRASH_MS));
const exitCode = readArg('--exit-code', 1);
const useStderr = process.argv.includes('--stderr');

let tick = 0;
process.stdout.write(`worker ${process.pid} started, exiting in ${Math.round(crashAfterMs)}ms\n`);

setInterval(() => {
    tick += 1;
    const line = `tick ${tick} from ${process.pid}\n`;
    if (useStderr && tick % 2 === 0) process.stderr.write(line);
    else process.stdout.write(line);
}, intervalMs);

setTimeout(() => {
    process.stderr.write(`worker ${process.pid} exiting with code ${exitCode}\n`);
    process.exit(exitCode);
}, crashAfterMs);
