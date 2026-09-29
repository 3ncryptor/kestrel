// Readiness probes (PRD P3): a process is "starting" until its check passes, "unready" if it times out.
const net = require('node:net');

const DEFAULT_INTERVAL_MS = 500;
const CONNECT_TIMEOUT_MS = 1000;
const HTTP_TIMEOUT_MS = 2000;
const LOCAL_HOSTS = ['127.0.0.1', '::1'];

/** True when something accepts a TCP connection on localhost (IPv4 first, then IPv6). */
function tcpCheck(port, hosts = LOCAL_HOSTS) {
    return new Promise((resolve) => {
        const attempt = (remaining) => {
            if (!remaining.length) return resolve(false);
            const socket = net.connect({ port, host: remaining[0] });
            socket.setTimeout(CONNECT_TIMEOUT_MS);
            const fail = () => {
                socket.destroy();
                attempt(remaining.slice(1));
            };
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', fail);
            socket.once('timeout', fail);
            return undefined;
        };
        attempt(hosts);
    });
}

/** True for a 2xx or 3xx answer within the timeout. Redirects are not followed. */
async function httpCheck(url, timeoutMs = HTTP_TIMEOUT_MS) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
        return res.status >= 200 && res.status < 400;
    } catch {
        return false;
    }
}

/**
 * @param {{ kind: 'port'|'http'|'log', target: number|string, timeoutMs: number }} ready
 * @param {{ onReady: (info: { kind: string, elapsedMs: number }) => void, onTimeout: () => void,
 *           intervalMs?: number, now?: () => number, tcp?: typeof tcpCheck, http?: typeof httpCheck }} hooks
 * @returns {{ start: () => void, feedLine: (text: string) => void, cancel: () => void }}
 */
function createProbe(ready, { onReady, onTimeout, intervalMs = DEFAULT_INTERVAL_MS, now = Date.now, tcp = tcpCheck, http = httpCheck }) {
    const pattern = ready.kind === 'log' ? new RegExp(String(ready.target)) : null;
    let done = false;
    let pollTimer = null;
    let deadline = null;
    let startedAt = 0;

    const finish = (fn, info) => {
        if (done) return;
        done = true;
        clearTimeout(pollTimer);
        clearTimeout(deadline);
        fn(info);
    };
    const pass = () => finish(onReady, { kind: ready.kind, elapsedMs: now() - startedAt });

    async function poll() {
        if (done) return;
        const ok = ready.kind === 'port' ? await tcp(Number(ready.target)) : await http(String(ready.target));
        if (done) return;
        if (ok) pass();
        else pollTimer = setTimeout(poll, intervalMs);
    }

    return {
        start() {
            startedAt = now();
            deadline = setTimeout(() => finish(onTimeout), ready.timeoutMs);
            if (!pattern) poll();
        },
        feedLine(text) {
            if (!done && pattern && pattern.test(text)) pass();
        },
        cancel() {
            done = true;
            clearTimeout(pollTimer);
            clearTimeout(deadline);
        },
    };
}

module.exports = { createProbe, tcpCheck, httpCheck };
