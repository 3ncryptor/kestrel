// npm distribution (M4): the generated launcher + per-platform packages, installed into a real
// node_modules layout and run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generate, TARGETS } = require('../../scripts/npm-packages');
const { version } = require('../../package.json');

function withBinaries(t, targets = TARGETS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-npm-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const bins = path.join(dir, 'bins');
    fs.mkdirSync(bins);
    for (const target of targets) {
        fs.writeFileSync(path.join(bins, `kestrel-${target}`), `#!/bin/sh\necho "fake ${target} $*"\nexit 3\n`, { mode: 0o755 });
    }
    return { dir, bins, out: path.join(dir, 'npm') };
}

test('generate writes the launcher package and one package per platform', (t) => {
    const { bins, out } = withBinaries(t);
    generate({ binaries: bins, out });
    const main = JSON.parse(fs.readFileSync(path.join(out, 'kestrel-tui', 'package.json'), 'utf-8'));
    assert.equal(main.name, 'kestrel-tui');
    assert.equal(main.version, version);
    assert.deepEqual(main.bin, { kestrel: 'bin/kestrel.js' });
    assert.deepEqual(Object.keys(main.optionalDependencies).sort(), TARGETS.map((t2) => `kestrel-tui-${t2}`).sort());
    assert.ok(Object.values(main.optionalDependencies).every((v) => v === version), 'platform packages pinned to the same version');
    assert.equal(main.scripts, undefined, 'no install scripts');

    const mac = JSON.parse(fs.readFileSync(path.join(out, 'kestrel-tui-darwin-arm64', 'package.json'), 'utf-8'));
    assert.deepEqual([mac.os, mac.cpu], [['darwin'], ['arm64']]);
    assert.equal(fs.statSync(path.join(out, 'kestrel-tui-darwin-arm64', 'bin', 'kestrel')).mode & 0o111, 0o111, 'executable');
    for (const dir of fs.readdirSync(out)) assert.ok(fs.existsSync(path.join(out, dir, 'LICENSE')), `${dir} ships the license`);
});

test('every package ships a README written for npm: kestrel-tui its own, each platform one of its own', (t) => {
    const { bins, out } = withBinaries(t);
    generate({ binaries: bins, out });
    for (const dir of fs.readdirSync(out)) {
        const manifest = JSON.parse(fs.readFileSync(path.join(out, dir, 'package.json'), 'utf-8'));
        assert.ok(manifest.files.includes('README.md'), `${dir} publishes its README`);
        const readme = fs.readFileSync(path.join(out, dir, 'README.md'), 'utf-8');
        assert.ok(readme.startsWith(`# ${dir}\n`), `${dir}'s README is titled with the package name`);
        // npmjs.com cannot resolve links relative to the repository: every link must be absolute or an anchor.
        const relative = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((href) => !/^(https:\/\/|#)/.test(href));
        assert.deepEqual(relative, [], `${dir}'s README has only absolute links`);
        assert.doesNotMatch(readme, /\{\{\w+\}\}/, `${dir}'s README has no unfilled placeholder`);
    }
    const npmDir = path.join(__dirname, '..', '..', 'packaging', 'npm');
    assert.equal(fs.readFileSync(path.join(out, 'kestrel-tui', 'README.md'), 'utf-8'), fs.readFileSync(path.join(npmDir, 'README.md'), 'utf-8'));

    const platform = fs.readFileSync(path.join(out, 'kestrel-tui-linux-arm64', 'README.md'), 'utf-8');
    assert.match(platform, /The `kestrel` binary for Linux on arm64/);
    assert.match(platform, /npm install -g kestrel-tui/);
    assert.match(platform, /\*\*kestrel-tui-linux-arm64\*\* \(this package\)/);
    assert.match(platform, /\[kestrel-tui-darwin-arm64\]\(https:\/\/www\.npmjs\.com\/package\/kestrel-tui-darwin-arm64\)/);
    assert.match(platform, /glibc/);
    assert.match(fs.readFileSync(path.join(out, 'kestrel-tui-darwin-x64', 'README.md'), 'utf-8'), /macOS 13 \(Ventura\) or newer/);
});

test('generate refuses to publish a partial set of platforms', (t) => {
    const { bins, out } = withBinaries(t, ['linux-x64']);
    assert.throws(() => generate({ binaries: bins, out }), /missing kestrel-darwin-arm64/);
});

function installLayout(t, { withPlatform }) {
    const { bins, out, dir } = withBinaries(t);
    generate({ binaries: bins, out });
    const modules = path.join(dir, 'app', 'node_modules');
    fs.mkdirSync(modules, { recursive: true });
    fs.cpSync(path.join(out, 'kestrel-tui'), path.join(modules, 'kestrel-tui'), { recursive: true });
    const target = `${process.platform}-${process.arch}`;
    if (withPlatform) fs.cpSync(path.join(out, `kestrel-tui-${target}`), path.join(modules, `kestrel-tui-${target}`), { recursive: true });
    return { launcher: path.join(modules, 'kestrel-tui', 'bin', 'kestrel.js'), target };
}

test('the launcher runs the platform binary with the arguments and passes its exit code back', (t) => {
    const { launcher, target } = installLayout(t, { withPlatform: true });
    const r = spawnSync(process.execPath, [launcher, 'sm', '--dump'], { encoding: 'utf-8' });
    assert.equal(r.stdout.trim(), `fake ${target} sm --dump`);
    assert.equal(r.status, 3);
});

test('the launcher explains a missing platform package and how else to install', (t) => {
    const { launcher, target } = installLayout(t, { withPlatform: false });
    const r = spawnSync(process.execPath, [launcher], { encoding: 'utf-8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`kestrel-tui-${target} is not installed`));
    assert.match(r.stderr, /--omit=optional|optional dependencies/);
    assert.match(r.stderr, /install\.sh/);
});
