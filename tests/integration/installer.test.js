// packaging/install.sh (curl | sh) against a fake release served over local HTTP.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const INSTALLER = path.join(__dirname, '..', '..', 'packaging', 'install.sh');
const VERSION = '0.2.0';
const TARGET = `${process.platform}-${process.arch}`;

async function fakeRelease(t, { tamper = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-installer-'));
    const name = `kestrel-v${VERSION}-${TARGET}`;
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'kestrel'), `#!/bin/sh\necho "kestrel ${VERSION}"\n`, { mode: 0o755 });
    execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: dir });
    const digest = tamper ? 'f'.repeat(64) : crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, `${name}.tar.gz`))).digest('hex');
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${digest}  ${name}.tar.gz\n`);
    const server = http.createServer((req, res) => {
        const file = path.join(dir, path.basename(req.url));
        if (!fs.existsSync(file)) return res.writeHead(404).end();
        res.writeHead(200);
        return fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    return { base: `http://127.0.0.1:${server.address().port}`, dir };
}

function install(env) {
    // spawnSync would block the event loop that serves the fake release; run the shell asynchronously.
    return new Promise((resolve) => {
        const child = require('node:child_process').spawn('sh', [INSTALLER], { env: { PATH: process.env.PATH, HOME: env.HOME, ...env } });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('close', (status) => resolve({ status, out }));
    });
}

test('install.sh downloads the release for this machine, verifies it and installs kestrel', async (t) => {
    const { base, dir } = await fakeRelease(t);
    const bin = path.join(dir, 'home', '.local', 'bin');
    const { status, out } = await install({ HOME: path.join(dir, 'home'), KESTREL_VERSION: `v${VERSION}`, KESTREL_DOWNLOAD_BASE: base });
    assert.equal(status, 0, out);
    assert.match(out, new RegExp(`Installed kestrel ${VERSION.replace(/\./g, '\\.')} to ${bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/kestrel`));
    assert.equal(execFileSync(path.join(bin, 'kestrel'), { encoding: 'utf-8' }).trim(), `kestrel ${VERSION}`);
    assert.match(out, /not on your PATH/, 'says how to add the directory to PATH');
});

test('install.sh refuses an archive whose checksum does not match, and installs nothing', async (t) => {
    const { base, dir } = await fakeRelease(t, { tamper: true });
    const target = path.join(dir, 'bin');
    const { status, out } = await install({ HOME: dir, KESTREL_VERSION: VERSION, KESTREL_DOWNLOAD_BASE: base, KESTREL_INSTALL_DIR: target });
    assert.notEqual(status, 0);
    assert.match(out, /checksum mismatch/i);
    assert.equal(fs.existsSync(path.join(target, 'kestrel')), false);
});

test('install.sh explains an unsupported platform', () => {
    const fakeUname = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-uname-'));
    fs.writeFileSync(path.join(fakeUname, 'uname'), '#!/bin/sh\n[ "$1" = "-s" ] && echo FreeBSD || echo amd64\n', { mode: 0o755 });
    try {
        const r = spawnSync('sh', [INSTALLER], { env: { PATH: `${fakeUname}:${process.env.PATH}`, HOME: fakeUname, KESTREL_VERSION: VERSION }, encoding: 'utf-8' });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /FreeBSD is not supported yet/);
    } finally {
        fs.rmSync(fakeUname, { recursive: true, force: true });
    }
});
