const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRunState, findOrphans } = require('../../core/processManager/runState');

function tempFile(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-run-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, '.kestrel', 'run.json');
}

test('record writes run.json privately; readPrevious reads it back; clear removes it', (t) => {
    const file = tempFile(t);
    const rs = createRunState({ path: file, pid: 4242 });
    assert.equal(rs.readPrevious(), null);
    rs.record([{ id: 'api', pid: 10, pgid: 10, startedAt: 1000 }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), { kestrelPid: 4242, children: [{ id: 'api', pid: 10, pgid: 10, startedAt: 1000 }] });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(rs.readPrevious().kestrelPid, 4242);
    rs.clear();
    assert.equal(fs.existsSync(file), false);
});

test('a corrupt run.json is treated as absent', (t) => {
    const file = tempFile(t);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ nope');
    assert.equal(createRunState({ path: file, pid: 1 }).readPrevious(), null);
});

test('findOrphans keeps only live children whose start time matches (so reused pids are ignored)', () => {
    const previous = {
        kestrelPid: 900,
        children: [
            { id: 'api', pid: 10, pgid: 10, startedAt: 100000 },
            { id: 'web', pid: 11, pgid: 11, startedAt: 100000 },
            { id: 'old', pid: 12, pgid: 12, startedAt: 100000 },
        ],
    };
    const startedAtOf = (pid) => ({ 10: 101000, 11: 999999 }[pid] ?? null); // 11 reused by someone else, 12 gone
    const orphans = findOrphans(previous, { currentPid: 1, startedAtOf });
    assert.deepEqual(orphans.map((o) => o.id), ['api']);
});

test('findOrphans ignores a run file written by this same Kestrel process', () => {
    const previous = { kestrelPid: 1, children: [{ id: 'api', pid: 10, pgid: 10, startedAt: 100000 }] };
    assert.deepEqual(findOrphans(previous, { currentPid: 1, startedAtOf: () => 100000 }), []);
    assert.deepEqual(findOrphans(null, { currentPid: 1, startedAtOf: () => 0 }), []);
});
