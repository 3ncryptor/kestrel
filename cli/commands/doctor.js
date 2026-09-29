// `kestrel doctor`: checks what Kestrel needs on this machine and says how to fix what is missing.
// ✓ ok · ! a warning with a fix · ✗ a failure. Only failures exit 1, so it can gate scripts and CI.
const fs = require('node:fs');
const path = require('node:path');
const { version: VERSION } = require('../../package.json');
const { createPlatform } = require('../../core/platform');
const { loadStack } = require('../../core/config');
const release = require('../release');

const MIN_COLS = 60;
const MIN_ROWS = 16;
const GLYPHS = { ok: '✓', warn: '!', fail: '✗' };
const METHODS = { binary: 'standalone binary', homebrew: 'Homebrew', npm: 'npm', source: 'source checkout' };
const LABEL_WIDTH = 10;

const ok = (label, detail) => ({ level: 'ok', label, detail });
const warn = (label, detail) => ({ level: 'warn', label, detail });
const fail = (label, detail) => ({ level: 'fail', label, detail });
const gb = (mb) => `${(mb / 1024).toFixed(1)} GB`;

function runtimeCheck({ bun, node }) {
    if (bun) return ok('runtime', `Bun ${bun}`);
    return warn('runtime', `Node ${node}: the dashboard needs the Kestrel binary or Bun ≥ 1.3 (headless commands work)`);
}

function samplingCheck(platform) {
    if (platform.id === 'linux') return ok('sampling', 'Linux, /proc');
    if (platform.sampling === 'native') return ok('sampling', 'macOS, native (libproc)');
    return warn('sampling', 'macOS, ps/lsof fallback: uses more CPU; the Kestrel binary samples natively (unless KESTREL_NATIVE=0)');
}

async function processesCheck(platform) {
    const started = Date.now();
    try {
        const procs = await platform.listProcesses();
        return ok('processes', `${procs.length} processes sampled in ${Date.now() - started} ms`);
    } catch (err) {
        return fail('processes', err.message);
    }
}

async function memoryCheck(platform) {
    try {
        const mem = await platform.memory();
        return ok('memory', `${gb(mem.usedMB)} of ${gb(mem.totalMB)} used`);
    } catch (err) {
        return fail('memory', err.message);
    }
}

async function portsCheck(platform) {
    try {
        const ports = await platform.listeningPorts();
        if (ports.partial) return warn('ports', "only your own processes' ports are visible · sudo kestrel to see all");
        return ok('ports', `${ports.items.length} listening TCP ports`);
    } catch (err) {
        return warn('ports', `${err.message} · the ports box will stay empty`);
    }
}

function colorDepth(env) {
    if (env.NO_COLOR) return 'no color';
    if (/truecolor|24bit/i.test(env.COLORTERM || '')) return 'truecolor';
    if (/256/.test(env.TERM || '')) return '256 colors';
    return '16 colors';
}

function terminalCheck(stdout, env) {
    if (!stdout.isTTY) return warn('terminal', 'not a terminal: the dashboard needs one (kestrel sm --dump works anywhere)');
    const size = `${stdout.columns}×${stdout.rows}`;
    const depth = colorDepth(env);
    if (stdout.columns < MIN_COLS || stdout.rows < MIN_ROWS) return warn('terminal', `${depth}, ${size} · the dashboard needs at least ${MIN_COLS}×${MIN_ROWS}`);
    return ok('terminal', `${depth}, ${size}`);
}

/** The project stack, validated as `kestrel pm` would, plus a writable .kestrel/ for logs. */
function stackChecks(cwd) {
    let stack;
    try {
        stack = loadStack({ cwd });
    } catch (err) {
        return [fail('stack', err.message)];
    }
    if (!stack.source) return [ok('stack', 'no stack here · kestrel init creates one')];
    if (stack.errors.length) {
        const n = stack.errors.length;
        const shown = stack.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ');
        return [fail('stack', `${stack.source} has ${n} problem${n === 1 ? '' : 's'}: ${shown}`)];
    }
    const names = stack.config ? stack.config.processes.map((p) => p.name) : stack.detected.scripts.map((s) => s.name);
    const what = stack.config ? `${names.length} processes (${names.join(', ')})` : `${names.length} scripts to pick from in kestrel pm`;
    const dir = path.dirname(stack.path || path.join(cwd, 'kestrel.json'));
    try {
        fs.accessSync(dir, fs.constants.W_OK);
        return [ok('stack', `${stack.source}: ${what}`), ok('logs', `${path.join(dir, '.kestrel')} is writable`)];
    } catch {
        return [ok('stack', `${stack.source}: ${what}`), fail('logs', `cannot write ${path.join(dir, '.kestrel')}: logs and crash recovery need it`)];
    }
}

/**
 * @param {{ options: any }} _parsed
 * @param {{ stdout: any, cwd: string, env: Record<string, any> }} io
 * @param {{ platform?: any, runtime?: { bun: string|null, node: string }, method?: string }} [deps]
 */
async function doctor(_parsed, io, deps = {}) {
    const runtime = deps.runtime || { bun: process.versions.bun || null, node: process.versions.node };
    const method = deps.method || release.currentInstall();
    const out = (s) => io.stdout.write(s);
    out(`kestrel ${VERSION} · ${METHODS[method] || method} · ${process.platform}-${process.arch}\n`);

    let platform;
    try {
        platform = deps.platform || createPlatform();
    } catch (err) {
        out(`${GLYPHS.fail} ${'platform'.padEnd(LABEL_WIDTH)} ${err.message}\n`);
        return 1;
    }
    const results = [
        runtimeCheck(runtime),
        samplingCheck(platform),
        await processesCheck(platform),
        await memoryCheck(platform),
        await portsCheck(platform),
        terminalCheck(io.stdout, io.env || {}),
        ...stackChecks(io.cwd),
    ];
    for (const r of results) out(`${GLYPHS[r.level]} ${r.label.padEnd(LABEL_WIDTH)} ${r.detail}\n`);
    return results.some((r) => r.level === 'fail') ? 1 : 0;
}

module.exports = { doctor };
