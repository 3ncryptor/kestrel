// `kestrel doctor` (M4): every check reports ok / warn / fail with a fix; only failures exit 1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { doctor } = require('../../cli/commands/doctor');

const platform = (overrides = {}) => ({
    id: 'darwin',
    sampling: 'native',
    listProcesses: async () => [{ pid: 1 }, { pid: 2 }],
    memory: async () => ({ usedMB: 8000, totalMB: 16384 }),
    listeningPorts: async () => ({ items: [{ port: 3000 }], partial: true }),
    ...overrides,
});

function run(t, overrides = {}) {
    const cwd = overrides.cwd || fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-doctor-')));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const out = [];
    const io = { stdout: { write: (s) => out.push(s), isTTY: true, columns: 120, rows: 40 }, stderr: { write: () => {} }, cwd, env: { COLORTERM: 'truecolor' } };
    return doctor({ options: {} }, { ...io, ...overrides.io }, {
        platform: platform(overrides.platform), runtime: { bun: '1.4.0', node: '20.20.2' }, method: 'binary', ...overrides.deps,
    }).then((code) => ({ code, out: out.join(''), cwd }));
}

test('a healthy machine: every check passes and the exit code is 0', async (t) => {
    const { code, out } = await run(t);
    assert.equal(code, 0);
    assert.match(out, /kestrel \d+\.\d+\.\d+ · standalone binary · /);
    assert.match(out, /✓ sampling\s+macOS, native \(libproc\)/);
    assert.match(out, /✓ processes\s+2 processes sampled in \d+ ms/);
    assert.match(out, /✓ memory\s+7\.8 GB of 16\.0 GB used/);
    assert.match(out, /! ports\s+only your own processes' ports are visible · sudo kestrel to see all/);
    assert.match(out, /✓ terminal\s+truecolor, 120×40/);
    assert.match(out, /✓ stack\s+no stack here · kestrel init creates one/);
});

test('problems a user can fix are warnings; a broken sampler or config is a failure (exit 1)', async (t) => {
    const warn = await run(t, {
        io: { stdout: { write: () => {}, isTTY: false }, env: { NO_COLOR: '1' } },
        deps: { runtime: { bun: null, node: '20.20.2' } },
        platform: { sampling: 'ps' },
    });
    assert.equal(warn.code, 0);

    const broken = await run(t, { platform: { listProcesses: async () => { throw new Error('ps not found'); } } });
    assert.equal(broken.code, 1);
    assert.match(broken.out, /✗ processes\s+ps not found/);
});

test('warnings explain what to do: Node runtime, ps fallback, no terminal, small window', async (t) => {
    const out = [];
    const { code } = await run(t, {
        io: { stdout: { write: (s) => out.push(s), isTTY: true, columns: 50, rows: 12 }, env: { TERM: 'xterm' } },
        deps: { runtime: { bun: null, node: '20.20.2' } },
        platform: { sampling: 'ps' },
    });
    const text = out.join('');
    assert.equal(code, 0);
    assert.match(text, /! runtime\s+Node 20\.20\.2: the dashboard needs the Kestrel binary or Bun ≥ 1\.3/);
    assert.match(text, /! sampling\s+macOS, ps\/lsof fallback/);
    assert.match(text, /! terminal\s+16 colors, 50×12 · the dashboard needs at least 60×16/);
});

test('the project stack is validated like kestrel pm does', async (t) => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-doctor-')));
    fs.writeFileSync(path.join(cwd, 'kestrel.json'), JSON.stringify({ version: 1, processes: { api: { cmd: 'x', restart: 'sometimes' } } }));
    const bad = await run(t, { cwd });
    assert.equal(bad.code, 1);
    assert.match(bad.out, /✗ stack\s+kestrel\.json has 1 problem/);
    assert.match(bad.out, /processes\.api\.restart/);

    fs.writeFileSync(path.join(cwd, 'kestrel.json'), JSON.stringify({ version: 1, processes: { api: { cmd: 'x' }, web: { cmd: 'y' } } }));
    const good = await run(t, { cwd });
    assert.equal(good.code, 0);
    assert.match(good.out, /✓ stack\s+kestrel\.json: 2 processes \(api, web\)/);
});
