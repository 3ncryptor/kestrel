// The release gate (scripts/release-notes.js): the tag must match package.json and CHANGELOG.md must
// have a dated section for the version, which becomes the GitHub Release notes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseNotes, checkTag } = require('../../scripts/release-notes');

const CHANGELOG = `# Changelog

Intro text.

## [Unreleased]

- Something not released.

## [0.2.0] - 2026-10-01

### Fixed

- A bug.

## [0.1.0] - 2026-09-29

### Added

- Everything.

[0.2.0]: https://github.com/3ncryptor/kestrel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/3ncryptor/kestrel/releases/tag/v0.1.0
`;

test('releaseNotes returns the body of the version section, up to the next section', () => {
    assert.equal(releaseNotes(CHANGELOG, '0.2.0'), '### Fixed\n\n- A bug.');
});

test('releaseNotes stops at the link references after the last section', () => {
    assert.equal(releaseNotes(CHANGELOG, '0.1.0'), '### Added\n\n- Everything.');
});

test('releaseNotes refuses a version without a section', () => {
    assert.throws(() => releaseNotes(CHANGELOG, '0.3.0'), /no "## \[0\.3\.0\] - YYYY-MM-DD" section/);
});

test('releaseNotes refuses an undated or empty section', () => {
    assert.throws(() => releaseNotes('## [0.1.0]\n\n- x\n', '0.1.0'), /no "## \[0\.1\.0\] - YYYY-MM-DD"/);
    assert.throws(() => releaseNotes('## [0.1.0] - 2026-09-29\n\n## [0.0.9] - 2026-01-01\n', '0.1.0'), /empty/);
});

test('releaseNotes does not treat the version as a pattern', () => {
    assert.throws(() => releaseNotes('## [0x1x0] - 2026-09-29\n\n- x\n', '0.1.0'), /no "## \[0\.1\.0\]/);
});

test('checkTag accepts v<version> and rejects anything else', () => {
    assert.doesNotThrow(() => checkTag('v0.1.0', '0.1.0'));
    assert.throws(() => checkTag('0.1.0', '0.1.0'), /tag 0\.1\.0 does not match package\.json version 0\.1\.0 \(expected v0\.1\.0\)/);
    assert.throws(() => checkTag('v0.1.1', '0.1.0'), /does not match/);
});
