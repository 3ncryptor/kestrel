// Release helpers and `kestrel update` (M4): install detection, versions, checksums, self-replacement.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const release = require('../../cli/release');
const { update } = require('../../cli/commands/update');

test('installMethod tells a standalone binary from Homebrew, npm and a source checkout', () => {
    const compiled = '/$bunfs/root/kestrel';
    assert.equal(release.installMethod({ main: compiled, execPath: '/home/me/.local/bin/kestrel' }), 'binary');
    assert.equal(release.installMethod({ main: compiled, execPath: '/opt/homebrew/Cellar/kestrel/0.1.0/bin/kestrel' }), 'homebrew');
    assert.equal(release.installMethod({ main: compiled, execPath: '/home/linuxbrew/.linuxbrew/Cellar/kestrel/0.1.0/bin/kestrel' }), 'homebrew');
    assert.equal(release.installMethod({ main: compiled, execPath: '/usr/lib/node_modules/kestrel-tui-linux-x64/bin/kestrel' }), 'npm');
    assert.equal(release.installMethod({ main: '/work/kestrel/cli/index.js', execPath: '/usr/bin/node' }), 'source');
});

test('versions compare numerically; tags may carry a v', () => {
    assert.equal(release.isNewer('v0.10.0', '0.9.9'), true);
    assert.equal(release.isNewer('0.1.0', '0.1.0'), false);
    assert.equal(release.isNewer('v0.1.0', '0.2.0'), false);
    assert.equal(release.parseVersion('v1.2.3'), '1.2.3');
    assert.throws(() => release.parseVersion('latest'), /not a version/);
});

test('asset names and SHA256SUMS', () => {
    assert.equal(release.assetName('0.2.0', 'darwin', 'arm64'), 'kestrel-v0.2.0-darwin-arm64.tar.gz');
    assert.throws(() => release.assetName('0.2.0', 'win32', 'x64'), /No release for win32-x64/);
    const sums = release.parseSums('aa11  kestrel-v0.2.0-linux-x64.tar.gz\nbb22  kestrel-v0.2.0-darwin-arm64.tar.gz\n');
    assert.equal(sums.get('kestrel-v0.2.0-darwin-arm64.tar.gz'), 'bb22');
});

// ---------- kestrel update against a fake GitHub release ----------

function fakeRelease(t, newVersion = '0.2.0') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-update-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const target = `${process.platform}-${process.arch}`;
    const name = `kestrel-v${newVersion}-${target}`;
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'kestrel'), `#!/bin/sh\necho "kestrel ${newVersion}"\n`, { mode: 0o755 });
    execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: dir });
    const tarball = fs.readFileSync(path.join(dir, `${name}.tar.gz`));
    const sums = `${crypto.createHash('sha256').update(tarball).digest('hex')}  ${name}.tar.gz\n`;
    const exe = path.join(dir, 'installed-kestrel');
    fs.writeFileSync(exe, '#!/bin/sh\necho "kestrel 0.1.0"\n', { mode: 0o755 });
    const assets = { [`${name}.tar.gz`]: tarball, SHA256SUMS: Buffer.from(sums) };
    const fetch = async (url) => {
        if (url.endsWith('/releases/latest')) {
            return { ok: true, status: 200, json: async () => ({ tag_name: `v${newVersion}`, assets: Object.keys(assets).map((n) => ({ name: n, browser_download_url: `https://dl/${n}` })) }) };
        }
        const body = assets[url.replace('https://dl/', '')];
        return body ? { ok: true, status: 200, arrayBuffer: async () => body } : { ok: false, status: 404 };
    };
    return { dir, exe, assets, fetch, tarballName: `${name}.tar.gz` };
}

function io() {
    const out = [];
    const err = [];
    return { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, out: () => out.join(''), err: () => err.join('') };
}

const parsed = (check = false) => ({ options: { check }, positionals: [] });

test('update --check reports a newer release without changing anything', async (t) => {
    const r = fakeRelease(t);
    const o = io();
    const code = await update(parsed(true), o, { fetch: r.fetch, currentVersion: '0.1.0', method: 'binary', execPath: r.exe });
    assert.equal(code, 0);
    assert.match(o.out(), /kestrel 0\.2\.0 is available \(you have 0\.1\.0\)/);
    assert.match(execFileSync(r.exe, { encoding: 'utf-8' }), /kestrel 0\.1\.0/);
});

test('update downloads, verifies the checksum, and replaces the binary in place', async (t) => {
    const r = fakeRelease(t);
    const o = io();
    const code = await update(parsed(), o, { fetch: r.fetch, currentVersion: '0.1.0', method: 'binary', execPath: r.exe });
    assert.equal(code, 0, o.err());
    assert.match(o.out(), /Updated kestrel 0\.1\.0 → 0\.2\.0/);
    assert.equal(execFileSync(r.exe, { encoding: 'utf-8' }).trim(), 'kestrel 0.2.0');
    assert.equal(fs.statSync(r.exe).mode & 0o777, 0o755);
});

test('update refuses an archive whose checksum does not match', async (t) => {
    const r = fakeRelease(t);
    r.assets.SHA256SUMS = Buffer.from(`${'0'.repeat(64)}  ${r.tarballName}\n`);
    const o = io();
    const code = await update(parsed(), o, { fetch: r.fetch, currentVersion: '0.1.0', method: 'binary', execPath: r.exe });
    assert.equal(code, 1);
    assert.match(o.err(), /checksum does not match/);
    assert.match(execFileSync(r.exe, { encoding: 'utf-8' }), /kestrel 0\.1\.0/, 'the installed binary is untouched');
});

test('update says when you are up to date, and defers to Homebrew, npm and git installs', async (t) => {
    const r = fakeRelease(t, '0.1.0');
    const latest = io();
    assert.equal(await update(parsed(), latest, { fetch: r.fetch, currentVersion: '0.1.0', method: 'binary', execPath: r.exe }), 0);
    assert.match(latest.out(), /kestrel 0\.1\.0 is the latest/);

    for (const [method, hint] of [['homebrew', /brew upgrade kestrel/], ['npm', /npm install -g kestrel-tui@latest/], ['source', /git pull/]]) {
        const o = io();
        assert.equal(await update(parsed(), o, { fetch: r.fetch, currentVersion: '0.1.0', method, execPath: r.exe }), 0);
        assert.match(o.out(), hint, method);
    }
});

test('update explains a failed download or an unreachable GitHub', async () => {
    const o = io();
    const code = await update(parsed(), o, { fetch: async () => ({ ok: false, status: 503 }), currentVersion: '0.1.0', method: 'binary', execPath: '/x' });
    assert.equal(code, 1);
    assert.match(o.err(), /Could not check for updates \(HTTP 503\)/);
});
