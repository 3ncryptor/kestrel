#!/usr/bin/env node
// The `kestrel` command of the kestrel-tui npm package. The real program is a standalone binary in a
// per-platform package (kestrel-tui-<os>-<arch>) that npm installs through optionalDependencies,
// picking the one matching this machine. This file only finds it and runs it with the terminal
// attached. No install scripts are involved.
const { spawn } = require('node:child_process');
const path = require('node:path');

const target = `${process.platform}-${process.arch}`;
const pkg = `kestrel-tui-${target}`;
const INSTALLER = 'curl -fsSL https://raw.githubusercontent.com/3ncryptor/kestrel/main/packaging/install.sh | sh';

function binaryPath() {
    try {
        return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'bin', 'kestrel');
    } catch {
        return null;
    }
}

const binary = binaryPath();
if (!binary) {
    process.stderr.write(
        `kestrel: ${pkg} is not installed.\n`
        + 'npm skips it when optional dependencies are turned off (--omit=optional, --no-optional),\n'
        + 'or when this platform has no build (Kestrel supports macOS and Linux on arm64 and x64).\n'
        + `Reinstall with optional dependencies, or install the binary directly:\n  ${INSTALLER}\n`,
    );
    process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });
// The binary owns the terminal; forward the signals the launcher receives instead of dying first.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', (err) => {
    process.stderr.write(`kestrel: could not start ${binary}: ${err.message}\n`);
    process.exit(1);
});
child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
});
