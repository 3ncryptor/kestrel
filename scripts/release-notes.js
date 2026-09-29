#!/usr/bin/env node
// The first gate of the release workflow (.github/workflows/release.yml, RELEASING.md):
//
//   node scripts/release-notes.js v0.1.0
//
// Fails unless the tag is v<package.json version> and CHANGELOG.md has a dated section for that
// version; prints the section's body, which becomes the GitHub Release notes.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @param {string} tag @param {string} version */
function checkTag(tag, version) {
    if (tag !== `v${version}`) throw new Error(`tag ${tag} does not match package.json version ${version} (expected v${version})`);
}

/**
 * The body of `## [<version>] - YYYY-MM-DD`, up to the next `## ` heading or the link references.
 * @param {string} changelog @param {string} version
 */
function releaseNotes(changelog, version) {
    const lines = changelog.split('\n');
    const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`);
    const start = lines.findIndex((line) => heading.test(line));
    if (start === -1) throw new Error(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith('## ') || /^\[[^\]]+\]: /.test(line));
    const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
    if (!body) throw new Error(`the CHANGELOG.md section for ${version} is empty`);
    return body;
}

if (require.main === module) {
    const tag = process.argv[2];
    if (!tag) {
        process.stderr.write('usage: node scripts/release-notes.js v<version>\n');
        process.exit(2);
    }
    try {
        const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
        checkTag(tag, version);
        process.stdout.write(`${releaseNotes(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8'), version)}\n`);
    } catch (err) {
        process.stderr.write(`release-notes: ${err.message}\n`);
        process.exit(1);
    }
}

module.exports = { releaseNotes, checkTag };
