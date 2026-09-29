#!/usr/bin/env bun
// Builds the standalone `kestrel` binary (BUILD_PLAN §13): one file with the Bun runtime, the UI and
// OpenTUI's native core inside, so a machine needs nothing installed to run it.
//
//   bun scripts/build.js              dist/kestrel-<os>-<arch>, smoke-tested
//   bun scripts/build.js --archive    also dist/kestrel-v<version>-<os>-<arch>.tar.gz + dist/SHA256SUMS
//
// OpenTUI ships its native core per platform (@opentui/core-<os>-<arch>), and `bun install` fetches only
// the one for the machine it runs on. So every target is built on its own OS/arch (the release workflow
// runs one job per target) instead of cross-compiling.
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const { version } = require('../package.json');
const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];

function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', ...options });
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}):\n${result.stderr || result.stdout}`);
    }
    return result.stdout;
}

function build(target) {
    const outfile = path.join(DIST, `kestrel-${target}`);
    run('bun', [
        'build', 'cli/index.js', '--compile', `--target=bun-${target}`, `--outfile=${outfile}`,
        // React's production build must be chosen at compile time (see docs/DEV.md).
        '--define', 'process.env.NODE_ENV="production"',
    ]);
    return outfile;
}

/** The binary must start, report this version and take a live snapshot. */
function smokeTest(binary) {
    const reported = run(binary, ['--version']).trim();
    if (reported !== `kestrel ${version}`) throw new Error(`${binary} reports "${reported}", expected "kestrel ${version}"`);
    const snapshot = JSON.parse(run(binary, ['sm', '--dump', '--ticks', '1']).trim());
    if (!snapshot.processCount) throw new Error(`${binary} sampled no processes`);
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** kestrel-v<version>-<target>.tar.gz with the binary (as `kestrel`), LICENSE and README.md. */
function archive(binary, target) {
    const name = `kestrel-v${version}-${target}`;
    const staging = path.join(DIST, name);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.copyFileSync(binary, path.join(staging, 'kestrel'));
    fs.chmodSync(path.join(staging, 'kestrel'), 0o755);
    for (const file of ['LICENSE', 'README.md']) fs.copyFileSync(path.join(ROOT, file), path.join(staging, file));
    const tarball = `${name}.tar.gz`;
    run('tar', ['-czf', tarball, name], { cwd: DIST });
    fs.rmSync(staging, { recursive: true, force: true });
    fs.appendFileSync(path.join(DIST, 'SHA256SUMS'), `${sha256(path.join(DIST, tarball))}  ${tarball}\n`);
    return tarball;
}

function main() {
    const target = `${process.platform}-${process.arch}`;
    if (!TARGETS.includes(target)) throw new Error(`Unsupported build machine ${target}; release targets: ${TARGETS.join(', ')}`);
    fs.mkdirSync(DIST, { recursive: true });
    const binary = build(target);
    smokeTest(binary);
    const size = (fs.statSync(binary).size / 1048576).toFixed(1);
    process.stdout.write(`built ${path.relative(ROOT, binary)} (${size} MB), smoke test passed\n`);
    if (process.argv.includes('--archive')) {
        process.stdout.write(`archived dist/${archive(binary, target)}\n`);
    }
}

try {
    main();
} catch (err) {
    process.stderr.write(`build: ${err.message}\n`);
    process.exitCode = 1;
}
