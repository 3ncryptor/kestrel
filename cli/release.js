// Release plumbing shared by `kestrel update` and `kestrel doctor` (BUILD_PLAN §13): where releases
// live, what this machine downloads, and how this copy of Kestrel was installed.
const REPO = '3ncryptor/kestrel';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const TARGETS = Object.freeze(['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']);
// A compiled binary runs its bundled code from Bun's virtual filesystem.
const BUNDLED_PREFIX = '/$bunfs/';

/** How to update each kind of install that is not a standalone binary. */
const UPDATE_COMMANDS = Object.freeze({
    homebrew: 'brew upgrade kestrel',
    npm: 'npm install -g kestrel-tui@latest',
    source: 'git pull && bun install',
});

/** @returns {'binary'|'homebrew'|'npm'|'source'} */
function installMethod({ main, execPath }) {
    if (!String(main || '').startsWith(BUNDLED_PREFIX)) return 'source';
    if (/\/(Cellar|homebrew|linuxbrew)\//.test(execPath)) return 'homebrew';
    if (execPath.includes('/node_modules/')) return 'npm';
    return 'binary';
}

function currentInstall() {
    const bun = /** @type {any} */ (globalThis).Bun;
    return installMethod({ main: bun ? bun.main : require.main?.filename, execPath: process.execPath });
}

/** 'v1.2.3' or '1.2.3' → '1.2.3'. */
function parseVersion(tag) {
    const match = /^v?(\d+\.\d+\.\d+)$/.exec(String(tag).trim());
    if (!match) throw new Error(`"${tag}" is not a version`);
    return match[1];
}

/** True when `candidate` is a later version than `current`. */
function isNewer(candidate, current) {
    const [a, b] = [parseVersion(candidate), parseVersion(current)].map((v) => v.split('.').map(Number));
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}

function assetName(version, platform, arch) {
    const target = `${platform}-${arch}`;
    if (!TARGETS.includes(target)) throw new Error(`No release for ${target} (available: ${TARGETS.join(', ')})`);
    return `kestrel-v${parseVersion(version)}-${target}.tar.gz`;
}

/** `SHA256SUMS` text → file name → hex digest. */
function parseSums(text) {
    const sums = new Map();
    for (const line of text.split('\n')) {
        const match = /^([0-9a-f]{64}|[0-9a-f]+)\s+\*?(\S+)$/.exec(line.trim());
        if (match) sums.set(match[2], match[1]);
    }
    return sums;
}

module.exports = {
    REPO, LATEST_RELEASE_URL, TARGETS, UPDATE_COMMANDS, installMethod, currentInstall, parseVersion, isNewer, assetName, parseSums,
};
