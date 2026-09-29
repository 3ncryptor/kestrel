const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLogBuffer } = require('../../core/processManager/logBuffer');
const { computeDelay } = require('../../core/processManager/backoff');

const clock = () => 1000;
const texts = (lines) => lines.map((l) => `${l.stream}:${l.text}`);

test('computeDelay doubles from 1 s and caps at 30 s', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => computeDelay(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    assert.equal(computeDelay(0), 1000);
    assert.equal(computeDelay(3, { base: 20, max: 50 }), 50);
});

test('write splits chunks into timestamped lines and holds partial lines per stream', () => {
    const buf = createLogBuffer({ maxLines: 10, now: clock });
    assert.deepEqual(buf.write('hello\nwor', 'stdout'), [{ seq: 1, ts: 1000, stream: 'stdout', text: 'hello' }]);
    assert.deepEqual(texts(buf.write('boom', 'stderr')), []);
    assert.deepEqual(texts(buf.write('ld\r\n', 'stdout')), ['stdout:world']);
    assert.deepEqual(texts(buf.flush()), ['stderr:boom']);
    assert.deepEqual(texts(buf.lines()), ['stdout:hello', 'stdout:world', 'stderr:boom']);
});

test('append adds Kestrel system lines', () => {
    const buf = createLogBuffer({ maxLines: 10, now: clock });
    const line = buf.append('crashed (exit 1)');
    assert.equal(line.stream, 'system');
    assert.equal(buf.count(), 1);
});

test('the buffer keeps only the newest maxLines lines, and sequence numbers keep counting', () => {
    const buf = createLogBuffer({ maxLines: 3, now: clock });
    buf.write('1\n2\n3\n4\n5\n', 'stdout');
    assert.deepEqual(buf.lines().map((l) => l.text), ['3', '4', '5']);
    assert.deepEqual(buf.lines().map((l) => l.seq), [3, 4, 5]);
});

test('lines() returns a copy callers cannot mutate', () => {
    const buf = createLogBuffer({ maxLines: 3, now: clock });
    buf.write('a\n', 'stdout');
    buf.lines().push({ seq: 99, ts: 0, stream: 'stdout', text: 'x' });
    assert.equal(buf.count(), 1);
});

test('query filters by substring (case-insensitive) or /regex/ and returns the newest matches', () => {
    const buf = createLogBuffer({ maxLines: 100, now: clock });
    buf.write('GET /health 200\nPOST /login 401\nGET /users 200\nget /x 500\n', 'stdout');
    assert.deepEqual(buf.query({ filter: 'get' }).lines.map((l) => l.text), ['GET /health 200', 'GET /users 200', 'get /x 500']);
    assert.deepEqual(buf.query({ filter: '/ [45]\\d\\d$/' }).lines.map((l) => l.text), ['POST /login 401', 'get /x 500']);
    const limited = buf.query({ filter: 'get', limit: 2 });
    assert.deepEqual(limited.lines.map((l) => l.text), ['GET /users 200', 'get /x 500']);
    assert.equal(limited.total, 3);
    assert.equal(buf.query({}).lines.length, 4);
});

test('query rejects an invalid regex with a readable error', () => {
    const buf = createLogBuffer({ maxLines: 10, now: clock });
    assert.throws(() => buf.query({ filter: '/([/' }), /Invalid search pattern/);
});
