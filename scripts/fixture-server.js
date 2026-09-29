#!/usr/bin/env node
// Configurable fixture process for M3 tests and the demo stack. Everything is opt-in:
//
//   --tcp <port>          listen on a raw TCP port (after --delay)
//   --http <port>         serve HTTP; GET /health → 200 "ok", anything else → 404
//   --delay <ms>          wait this long before listening / printing the ready line (default 0)
//   --ready-line <text>   print this line once "ready"
//   --tick <ms>           print "tick N" every <ms>
//   --warn-every <n>      with --tick: every n-th tick goes to stderr as "warn: slow tick N"
//   --exit-after <ms>     exit after <ms> with --exit-code (default 1)
//   --echo-env <A,B>      print "env A=<value>" for each variable at start
//   --trap <SIGNAL>       on SIGNAL print "got SIGNAL" and exit 0
//   --ignore-term         ignore SIGTERM (to test SIGKILL escalation)
const http = require('node:http');
const net = require('node:net');

function arg(name, fallback = undefined) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

const delay = Number(arg('--delay', 0));
const say = (line) => process.stdout.write(`${line}\n`);

for (const name of (arg('--echo-env', '') || '').split(',').filter(Boolean)) say(`env ${name}=${process.env[name] ?? ''}`);

const trap = arg('--trap');
if (trap) process.on(trap, () => {
    say(`got ${trap}`);
    process.exit(0);
});
if (has('--ignore-term')) process.on('SIGTERM', () => say('ignoring SIGTERM'));

function listen() {
    const tcp = arg('--tcp');
    const httpPort = arg('--http');
    if (tcp) net.createServer((socket) => socket.end()).listen(Number(tcp), '127.0.0.1');
    if (httpPort) {
        http.createServer((req, res) => {
            const ok = req.url === '/health';
            res.writeHead(ok ? 200 : 404);
            res.end(ok ? 'ok' : 'not found');
        }).listen(Number(httpPort), '127.0.0.1');
    }
    const readyLine = arg('--ready-line');
    if (readyLine) say(readyLine);
}

setTimeout(listen, delay);

const tick = arg('--tick');
if (tick) {
    const warnEvery = Number(arg('--warn-every', 0));
    let n = 0;
    setInterval(() => {
        n += 1;
        if (warnEvery && n % warnEvery === 0) process.stderr.write(`warn: slow tick ${n}\n`);
        else say(`tick ${n}`);
    }, Number(tick));
}

const exitAfter = arg('--exit-after');
if (exitAfter) setTimeout(() => process.exit(Number(arg('--exit-code', 1))), Number(exitAfter));

// Keep running until told otherwise.
setInterval(() => {}, 1 << 30);
