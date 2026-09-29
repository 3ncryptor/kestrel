#!/usr/bin/env node
// Generates the npm packages from the release binaries (the esbuild/Biome pattern):
//   kestrel-tui                  the `kestrel` launcher; one optionalDependency per platform
//   kestrel-tui-<os>-<arch>      the standalone binary, restricted with os/cpu so npm picks one
//
//   node scripts/npm-packages.js <dir with kestrel-<os>-<arch> binaries> <out dir>
//
// Every package has the same version and no install scripts. All four platforms must be present:
// publishing a partial set would break `npm i -g kestrel-tui` on the missing ones.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const root = require('../package.json');
const TARGETS = Object.freeze(['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']);

const common = () => ({
    version: root.version,
    license: root.license,
    repository: root.repository,
    homepage: root.homepage,
    bugs: root.bugs,
});

function writePackage(dir, manifest, files) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
    for (const [from, to, mode] of files) {
        fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
        fs.copyFileSync(from, path.join(dir, to));
        if (mode) fs.chmodSync(path.join(dir, to), mode);
    }
}

/** @param {{ binaries: string, out: string }} dirs */
function generate({ binaries, out }) {
    const missing = TARGETS.filter((t) => !fs.existsSync(path.join(binaries, `kestrel-${t}`)));
    if (missing.length) throw new Error(`missing ${missing.map((t) => `kestrel-${t}`).join(', ')} in ${binaries}`);
    fs.rmSync(out, { recursive: true, force: true });
    for (const target of TARGETS) {
        const [os, cpu] = target.split('-');
        writePackage(path.join(out, `kestrel-tui-${target}`), {
            name: `kestrel-tui-${target}`,
            description: `The kestrel binary for ${target} (installed by kestrel-tui)`,
            ...common(),
            os: [os],
            cpu: [cpu],
            files: ['bin/kestrel', 'LICENSE'],
        }, [[path.join(binaries, `kestrel-${target}`), 'bin/kestrel', 0o755]]);
    }
    writePackage(path.join(out, 'kestrel-tui'), {
        name: 'kestrel-tui',
        description: root.description,
        ...common(),
        keywords: root.keywords,
        bin: { kestrel: 'bin/kestrel.js' },
        files: ['bin/kestrel.js', 'README.md', 'LICENSE'],
        engines: { node: '>=18' },
        os: root.os,
        optionalDependencies: Object.fromEntries(TARGETS.map((t) => [`kestrel-tui-${t}`, root.version])),
    }, [
        [path.join(ROOT, 'packaging', 'npm', 'launcher.js'), 'bin/kestrel.js', 0o755],
        [path.join(ROOT, 'README.md'), 'README.md'],
    ]);
    return TARGETS.map((t) => `kestrel-tui-${t}`).concat('kestrel-tui');
}

if (require.main === module) {
    const [binaries, out] = process.argv.slice(2);
    if (!binaries || !out) {
        process.stderr.write('usage: node scripts/npm-packages.js <binaries dir> <out dir>\n');
        process.exit(2);
    }
    try {
        for (const name of generate({ binaries: path.resolve(binaries), out: path.resolve(out) })) process.stdout.write(`${name}\n`);
    } catch (err) {
        process.stderr.write(`npm-packages: ${err.message}\n`);
        process.exit(1);
    }
}

module.exports = { generate, TARGETS };
