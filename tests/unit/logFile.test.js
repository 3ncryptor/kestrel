const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogFile, formatLine } = require('../../core/processManager/logFile');

function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-logs-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, '.kestrel', 'logs');
}

const line = (text, stream = 'stdout') => ({ seq: 1, ts: Date.UTC(2026, 8, 29, 10, 0, 0), stream, text });

test('formatLine is `ISO-time stream text`', () => {
    assert.equal(formatLine(line('GET /health 200')), '2026-09-29T10:00:00.000Z stdout GET /health 200\n');
});

test('lines are buffered, then written to <dir>/<id>.log with private permissions', (t) => {
    const dir = tempDir(t);
    const log = createLogFile({ dir, id: 'api', flushMs: 10000 });
    log.write(line('one'));
    log.write(line('two', 'stderr'));
    const file = path.join(dir, 'api.log');
    assert.equal(fs.existsSync(file), false, 'nothing written before the flush');
    log.flushSync();
    assert.match(fs.readFileSync(file, 'utf-8'), /stdout one\n.*stderr two\n$/s);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    log.close();
});

test('files rotate at maxBytes and keep at most `keep` old files', (t) => {
    const dir = tempDir(t);
    const log = createLogFile({ dir, id: 'w', maxBytes: 100, keep: 2, flushMs: 10000 });
    for (let i = 0; i < 12; i++) {
        log.write(line(`line ${i} ${'x'.repeat(30)}`));
        log.flushSync();
    }
    log.close();
    const names = fs.readdirSync(dir).sort();
    assert.deepEqual(names, ['w.log', 'w.log.1', 'w.log.2']);
    assert.ok(fs.statSync(path.join(dir, 'w.log')).size <= 100);
    assert.match(fs.readFileSync(path.join(dir, 'w.log'), 'utf-8'), /line 11/);
});

test('a write failure disables the file and reports once, without throwing', (t) => {
    const dir = tempDir(t);
    const errors = [];
    const brokenFs = {
        ...fs,
        writeSync: () => {
            throw new Error('disk full');
        },
    };
    const log = createLogFile({ dir, id: 'x', flushMs: 10000, fs: brokenFs, onError: (e) => errors.push(e.message) });
    log.write(line('a'));
    log.flushSync();
    log.write(line('b'));
    log.flushSync();
    assert.deepEqual(errors, ['disk full']);
    assert.equal(log.disabled, true);
    log.close();
});

test('a symlink planted at the log path is refused, not written through (CodeQL js/file-system-race)', (t) => {
    const dir = tempDir(t);
    fs.mkdirSync(dir, { recursive: true });
    const victim = path.join(path.dirname(dir), 'victim.txt');
    fs.writeFileSync(victim, 'original\n');
    fs.symlinkSync(victim, path.join(dir, 'api.log'));
    const errors = [];
    const log = createLogFile({ dir, id: 'api', flushMs: 5, onError: (err) => errors.push(err) });
    log.write(line('should not land in the victim'));
    log.flushSync();
    assert.equal(fs.readFileSync(victim, 'utf-8'), 'original\n');
    assert.equal(errors.length, 1);
    assert.equal(log.disabled, true);
});
