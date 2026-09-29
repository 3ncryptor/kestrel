const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCli, UsageError } = require('../../cli/args');
const { main } = require('../../cli');
const { version } = require('../../package.json');

const usage = (argv, pattern) => assert.throws(() => parseCli(argv), (e) => e instanceof UsageError && e.exitCode === 2 && pattern.test(e.message));

function fakeIo() {
    const out = [];
    const err = [];
    return {
        io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, cwd: '/tmp', env: {} },
        out: () => out.join(''),
        err: () => err.join(''),
    };
}

test('no arguments opens the dashboard', () => {
    assert.equal(parseCli([]).command, 'dashboard');
});

test('pm/sm subcommands and their -pm/--pm/-sm/--sm aliases', () => {
    for (const argv of [['pm'], ['-pm'], ['--pm']]) assert.equal(parseCli(argv).command, 'pm', argv.join(' '));
    for (const argv of [['sm'], ['-sm'], ['--sm']]) assert.equal(parseCli(argv).command, 'sm', argv.join(' '));
});

test('options are parsed and converted', () => {
    const parsed = parseCli(['sm', '--dump', '--ticks', '3', '--interval', '500', '--no-color']);
    assert.deepEqual(parsed.options, { config: null, only: [], noColor: true, dump: true, ticks: 3, intervalMs: 500, force: false, yes: false, check: false });
    assert.deepEqual([parseCli(['init', '--force', '-y']).options.force, parseCli(['init', '--force', '-y']).options.yes], [true, true]);
    assert.deepEqual(parseCli(['pm', '--only', 'api, web', '--config', 'ops/k.json']).options.only, ['api', 'web']);
    assert.deepEqual(parseCli(['import', 'pm2', 'eco.json']).positionals, ['pm2', 'eco.json']);
});

test('-h/--help and -v/--version win over the command', () => {
    assert.equal(parseCli(['-h']).command, 'help');
    assert.equal(parseCli(['sm', '--help']).command, 'help');
    assert.equal(parseCli(['-v']).command, 'version');
    assert.equal(parseCli(['help']).command, 'help');
});

test('usage errors are specific and exit with code 2', () => {
    usage(['--bogus'], /Unknown option/);
    usage(['-p'], /Unknown option/);
    usage(['frobnicate'], /Unknown command "frobnicate"/);
    usage(['pm', '--dump'], /--dump only works with "sm"/);
    usage(['sm', '--ticks', '2'], /--ticks needs --dump/);
    usage(['sm', '--dump', '--ticks', '0'], /--ticks/);
    usage(['sm', '--interval', '5'], /--interval/);
    usage(['sm', '--only', 'api'], /--only only works with "pm"/);
    usage(['import'], /import pm2/);
    usage(['pm', '--force'], /--force only works with "init" and "import"/);
    usage(['sm', '-y'], /--yes only works/);
    usage(['pm', '--check'], /--check only works with "update"/);
    usage(['sm', 'extra'], /Unexpected argument "extra"/);
    usage(['--config'], /argument missing|requires/i);
});

test('main prints the version and help', async () => {
    const v = fakeIo();
    assert.equal(await main(['--version'], v.io), 0);
    assert.equal(v.out().trim(), `kestrel ${version}`);

    const h = fakeIo();
    assert.equal(await main(['--help'], h.io), 0);
    assert.match(h.out(), /kestrel pm/);
    assert.match(h.out(), /kestrel sm/);
});

test('main reports usage errors on stderr with exit code 2', async () => {
    const f = fakeIo();
    assert.equal(await main(['--bogus'], f.io), 2);
    assert.match(f.err(), /Unknown option/);
    assert.match(f.err(), /kestrel --help/);
});

test('the interactive UI refuses cleanly without Bun or without a terminal', async () => {
    for (const argv of [[], ['sm'], ['-sm']]) {
        const f = fakeIo();
        assert.equal(await main(argv, f.io), 1, argv.join(' '));
        assert.match(f.err(), /Bun|interactive terminal/);
        assert.match(f.err(), /kestrel sm --dump/);
    }
});
