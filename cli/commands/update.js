// `kestrel update [--check]`: replaces a standalone binary with the latest GitHub release, after
// checking the archive's SHA-256 against the release's SHA256SUMS and running the new binary once.
// Homebrew, npm and source installs are pointed at their own update command instead.
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version: VERSION } = require('../../package.json');
const release = require('../release');

const CHECK_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const METHOD_LABELS = { homebrew: 'Homebrew', npm: 'npm', source: 'a source checkout' };

async function latestRelease(fetchFn) {
    let res;
    try {
        res = await fetchFn(release.LATEST_RELEASE_URL, {
            headers: { accept: 'application/vnd.github+json', 'user-agent': `kestrel/${VERSION}` },
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
    } catch (err) {
        throw new Error(`Could not check for updates (${err.message})`);
    }
    if (!res.ok) throw new Error(`Could not check for updates (HTTP ${res.status})`);
    const body = await res.json();
    return {
        version: release.parseVersion(body.tag_name),
        assets: new Map((body.assets || []).map((a) => [a.name, a.browser_download_url])),
    };
}

async function download(fetchFn, url, what) {
    if (!url) throw new Error(`The release has no ${what}`);
    const res = await fetchFn(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Could not download ${what} (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

/** Unpacks the archive and checks that its binary runs and is the expected version. */
function unpack(tarball, name, expected, tmp) {
    fs.writeFileSync(path.join(tmp, name), tarball);
    execFileSync('tar', ['-xzf', name], { cwd: tmp });
    const binary = path.join(tmp, name.replace(/\.tar\.gz$/, ''), 'kestrel');
    const reported = execFileSync(binary, ['--version'], { encoding: 'utf-8' }).trim();
    if (reported !== `kestrel ${expected}`) throw new Error(`The downloaded binary reports "${reported}"; not installing it`);
    return binary;
}

/** Atomic replace: stage next to the target (same filesystem), then rename over it. */
function replace(binary, target) {
    const staged = path.join(path.dirname(target), `.kestrel-update-${process.pid}`);
    try {
        fs.copyFileSync(binary, staged);
        fs.chmodSync(staged, 0o755);
        fs.renameSync(staged, target);
    } catch (err) {
        fs.rmSync(staged, { force: true });
        if (err.code === 'EACCES' || err.code === 'EPERM') throw new Error(`No permission to replace ${target}; run: sudo kestrel update`);
        throw err;
    }
}

async function install(latest, deps, io) {
    const name = release.assetName(latest.version, deps.platform, deps.arch);
    const [tarball, sumsText] = await Promise.all([
        download(deps.fetch, latest.assets.get(name), name),
        download(deps.fetch, latest.assets.get('SHA256SUMS'), 'SHA256SUMS'),
    ]);
    const expected = release.parseSums(sumsText.toString('utf-8')).get(name);
    const actual = crypto.createHash('sha256').update(tarball).digest('hex');
    if (!expected || expected !== actual) throw new Error(`The ${name} checksum does not match SHA256SUMS; not installing it`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-update-'));
    try {
        replace(unpack(tarball, name, latest.version, tmp), deps.execPath);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    io.stdout.write(`Updated kestrel ${deps.currentVersion} → ${latest.version} (${deps.execPath})\n`);
}

/**
 * @param {{ options: { check?: boolean } }} parsed
 * @param {{ stdout: { write: (s: string) => any }, stderr: { write: (s: string) => any } }} io
 * @param {{ fetch?: any, currentVersion?: string, method?: string, execPath?: string, platform?: string, arch?: string }} [overrides]
 */
async function update(parsed, io, overrides = {}) {
    const deps = {
        fetch: globalThis.fetch,
        currentVersion: VERSION,
        method: release.currentInstall(),
        execPath: process.execPath,
        platform: process.platform,
        arch: process.arch,
        ...overrides,
    };
    if (deps.method !== 'binary') {
        io.stdout.write(`kestrel was installed with ${METHOD_LABELS[deps.method]}; update it with:\n  ${release.UPDATE_COMMANDS[deps.method]}\n`);
        return 0;
    }
    try {
        const latest = await latestRelease(deps.fetch);
        if (!release.isNewer(latest.version, deps.currentVersion)) {
            io.stdout.write(`kestrel ${deps.currentVersion} is the latest version\n`);
            return 0;
        }
        if (parsed.options.check) {
            io.stdout.write(`kestrel ${latest.version} is available (you have ${deps.currentVersion}) · run: kestrel update\n`);
            return 0;
        }
        await install(latest, deps, io);
        return 0;
    } catch (err) {
        io.stderr.write(`kestrel: ${err.message}\n`);
        return 1;
    }
}

module.exports = { update };
