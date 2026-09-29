const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const { createProbe, tcpCheck, httpCheck } = require('../../core/processManager/readiness');

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

function waitFor(probeEvents, name) {
    return new Promise((resolve) => probeEvents.push([name, resolve]));
}

function probeWith(ready, overrides = {}) {
    const events = [];
    const result = { ready: null, timeout: null };
    const probe = createProbe(ready, {
        intervalMs: 20,
        onReady: (info) => {
            result.ready = info;
            for (const [, r] of events.filter(([n]) => n === 'ready')) r(info);
        },
        onTimeout: () => {
            result.timeout = true;
            for (const [, r] of events.filter(([n]) => n === 'timeout')) r();
        },
        ...overrides,
    });
    return { probe, events, result };
}

test('tcpCheck and httpCheck report whether something answers', async () => {
    const port = await freePort();
    assert.equal(await tcpCheck(port), false);
    const server = http.createServer((req, res) => {
        res.writeHead(req.url === '/health' ? 200 : 500);
        res.end();
    }).listen(port, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    try {
        assert.equal(await tcpCheck(port), true);
        assert.equal(await httpCheck(`http://127.0.0.1:${port}/health`), true);
        assert.equal(await httpCheck(`http://127.0.0.1:${port}/broken`), false, '5xx is not ready');
    } finally {
        server.close();
    }
});

test('a port probe passes once something starts listening', async () => {
    const port = await freePort();
    const { probe, events } = probeWith({ kind: 'port', target: port, timeoutMs: 5000 });
    const ready = waitFor(events, 'ready');
    probe.start();
    const server = net.createServer().listen(port, '127.0.0.1');
    try {
        const info = await ready;
        assert.equal(info.kind, 'port');
        assert.ok(info.elapsedMs >= 0);
    } finally {
        probe.cancel();
        server.close();
    }
});

test('a probe times out and reports unready', async () => {
    const port = await freePort();
    const { probe, events, result } = probeWith({ kind: 'port', target: port, timeoutMs: 80 });
    const timeout = waitFor(events, 'timeout');
    probe.start();
    await timeout;
    assert.equal(result.timeout, true);
    assert.equal(result.ready, null);
});

test('a log probe matches output lines against the pattern', () => {
    const { probe, result } = probeWith({ kind: 'log', target: 'listening on \\d+', timeoutMs: 5000 });
    probe.start();
    probe.feedLine('booting…');
    assert.equal(result.ready, null);
    probe.feedLine('listening on 3000');
    assert.equal(result.ready.kind, 'log');
    probe.feedLine('listening on 3000'); // reports once only
    probe.cancel();
});

test('cancel stops a probe before it reports anything', async () => {
    const port = await freePort();
    const { probe, result } = probeWith({ kind: 'port', target: port, timeoutMs: 60 });
    probe.start();
    probe.cancel();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(result.timeout, null);
    assert.equal(result.ready, null);
});
