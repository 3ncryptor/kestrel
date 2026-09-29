// Pure logic of the managed box and the logs panel (UI_SPEC §6.5, §6.7).
import { expect, test } from 'bun:test';
import { statusLabel, readySummary, isActive, parseAdHoc, managedRows } from '../../ui/logic/managed.js';
import { logView, highlightParts, sanitizeLine } from '../../ui/logic/logs.js';

const NOW = 1_790_000_000_000;
const entry = (status, extra = {}) => ({
    id: 'api', status, pid: null, startedAt: NOW - 4000, restartCount: 0, exitCode: null, signal: null,
    nextRestartAt: null, ready: null, blockedBy: [], ...extra,
});

test('status labels say what each state means, with numbers where they help', () => {
    expect(statusLabel(entry('idle'), NOW)).toBe('idle');
    expect(statusLabel(entry('starting'), NOW)).toBe('starting 4s');
    expect(statusLabel(entry('running', { ready: { kind: 'port', target: 3000, ok: true } }), NOW)).toBe('ready :3000');
    expect(statusLabel(entry('running', { ready: { kind: 'http', target: 'http://127.0.0.1:8080/health', ok: true } }), NOW)).toBe('ready :8080');
    expect(statusLabel(entry('running', { ready: { kind: 'log', target: 'listening', ok: true } }), NOW)).toBe('ready');
    expect(statusLabel(entry('running', { startedAt: NOW - 125_000 }), NOW)).toBe('up 2m 5s');
    expect(statusLabel(entry('unready', { ready: { kind: 'port', target: 3000, ok: false } }), NOW)).toBe('not ready :3000');
    expect(statusLabel(entry('restarting', { restartCount: 3, nextRestartAt: NOW + 3200 }), NOW)).toBe('retry 3 in 4s');
    expect(statusLabel(entry('crashed', { exitCode: 1 }), NOW)).toBe('crashed (exit 1)');
    expect(statusLabel(entry('errored', { exitCode: 2 }), NOW)).toBe('errored (exit 2)');
    expect(statusLabel(entry('errored'), NOW)).toBe('errored');
    expect(statusLabel(entry('blocked', { blockedBy: ['db', 'cache'] }), NOW)).toBe('blocked by db, cache');
    expect(statusLabel(entry('stopped', { signal: 'SIGTERM' }), NOW)).toBe('stopped');
    expect(statusLabel(entry('exited', { exitCode: 0 }), NOW)).toBe('exited (exit 0)');
});

test('ready summary and activity', () => {
    const list = [entry('running'), entry('starting', { pid: 5 }), entry('idle'), entry('restarting')];
    expect(readySummary(list)).toBe('1/4');
    expect(list.filter(isActive).length).toBe(2);
});

test('parseAdHoc: "name: command", or just a command', () => {
    expect(parseAdHoc('web: npm run dev')).toEqual({ name: 'web', cmd: 'npm run dev' });
    expect(parseAdHoc('  node server.js ')).toEqual({ name: undefined, cmd: 'node server.js' });
    expect(parseAdHoc('PORT=1 node a.js')).toEqual({ name: undefined, cmd: 'PORT=1 node a.js' });
    expect(parseAdHoc('   ')).toBe(null);
});

test('managedRows sizes the box for its content (entries, empty state or config errors)', () => {
    expect(managedRows({ managed: [entry('idle'), entry('idle')], stack: { errors: [], scripts: null } })).toBe(2);
    expect(managedRows({ managed: [], stack: { errors: [], scripts: null } })).toBe(2);
    expect(managedRows({ managed: [], stack: { errors: [{}, {}, {}, {}, {}], scripts: null } })).toBe(4);
});

// ---------- logs ----------

const line = (seq, ts, text, stream = 'stdout') => ({ seq, ts, stream, text });
const LOGS = {
    api: [line(1, 100, 'GET /health 200'), line(2, 300, 'boom', 'stderr'), line(3, 500, 'GET /users 200')],
    db: [line(1, 200, 'ready'), line(2, 400, 'checkpoint')],
};
function getLogs(id, { filter = '', limit = 200 } = {}) {
    const matches = LOGS[id].filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()));
    return { ok: true, data: { lines: matches.slice(-limit), total: matches.length } };
}

test('following shows the newest lines; "all" interleaves processes by time', () => {
    const one = logView({ getLogs, ids: ['api'], filter: '', follow: true, rows: 2 });
    expect(one.lines.map((l) => l.text)).toEqual(['boom', 'GET /users 200']);
    expect(one.total).toBe(3);
    const all = logView({ getLogs, ids: ['api', 'db'], filter: '', follow: true, rows: 10 });
    expect(all.lines.map((l) => `${l.id}:${l.ts}`)).toEqual(['api:100', 'db:200', 'api:300', 'db:400', 'api:500']);
});

test('paused: the view stays put while new lines arrive, and counts them', () => {
    const paused = logView({ getLogs, ids: ['api', 'db'], filter: '', follow: false, anchorTs: 300, offset: 1, rows: 2 });
    expect(paused.lines.map((l) => l.ts)).toEqual([100, 200]);
    expect(paused.newCount).toBe(2);
    expect(paused.maxOffset).toBe(1);
    const pinned = logView({ getLogs, ids: ['api'], filter: '', follow: false, anchorTs: 500, offset: 99, rows: 2 });
    expect(pinned.lines.map((l) => l.ts)).toEqual([100, 300]);
});

test('a search filters, counts matches and reports a bad pattern', () => {
    const view = logView({ getLogs, ids: ['api'], filter: 'get', follow: true, rows: 10 });
    expect(view.total).toBe(2);
    const bad = logView({ getLogs: () => ({ ok: false, error: 'Invalid search pattern: x' }), ids: ['api'], filter: '/(/', follow: true, rows: 5 });
    expect(bad.error).toBe('Invalid search pattern: x');
    expect(bad.lines).toEqual([]);
});

test('highlightParts marks substring and /regex/ matches', () => {
    expect(highlightParts('GET /users 200', 'users')).toEqual([
        { text: 'GET /', match: false }, { text: 'users', match: true }, { text: ' 200', match: false },
    ]);
    expect(highlightParts('a1 b22', '/\\d+/')).toEqual([
        { text: 'a', match: false }, { text: '1', match: true }, { text: ' b', match: false }, { text: '22', match: true },
    ]);
    expect(highlightParts('plain', '')).toEqual([{ text: 'plain', match: false }]);
    expect(highlightParts('aaa', '/x*/')).toEqual([{ text: 'aaa', match: false }]);
    expect(highlightParts('x', '/(/')).toEqual([{ text: 'x', match: false }]);
});

test('sanitizeLine strips colors, terminal control sequences and control characters', () => {
    expect(sanitizeLine('\x1b[32m✓ ready\x1b[0m in 120ms')).toBe('✓ ready in 120ms');
    expect(sanitizeLine('\x1b]0;evil title\x07hello')).toBe('hello');
    expect(sanitizeLine('\x1b[2J\x1b[Hwiped?')).toBe('wiped?');
    expect(sanitizeLine('a\tb\rc\x00d\x9b')).toBe('a    bcd');
    expect(sanitizeLine('plain ünïcode ⚡')).toBe('plain ünïcode ⚡');
});
