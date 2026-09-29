// Homebrew formula generation (M4): one URL + checksum per OS/arch from the release's SHA256SUMS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formula } = require('../../scripts/homebrew-formula');

const SUMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']
    .map((t, i) => `${String(i + 1).repeat(64)}  kestrel-v0.2.0-${t}.tar.gz`).join('\n');

test('the formula pins every platform archive to its checksum', () => {
    const rb = formula({ version: '0.2.0', sums: SUMS });
    assert.match(rb, /class Kestrel < Formula/);
    assert.match(rb, /version "0\.2\.0"/);
    assert.match(rb, /license "MIT"/);
    for (const [target, digit] of [['darwin-arm64', 1], ['darwin-x64', 2], ['linux-x64', 3], ['linux-arm64', 4]]) {
        const block = new RegExp(`url "https://github\\.com/3ncryptor/kestrel/releases/download/v0\\.2\\.0/kestrel-v0\\.2\\.0-${target}\\.tar\\.gz"\\n\\s+sha256 "${String(digit).repeat(64)}"`);
        assert.match(rb, block, target);
    }
    assert.match(rb, /bin\.install "kestrel"/);
    assert.match(rb, /shell_output\("#\{bin\}\/kestrel --version"\)/);
});

test('a missing platform checksum is an error, not a broken formula', () => {
    assert.throws(() => formula({ version: '0.2.0', sums: SUMS.split('\n').slice(1).join('\n') }), /no checksum for kestrel-v0\.2\.0-darwin-arm64/);
});
