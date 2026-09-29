#!/usr/bin/env bun
// Kestrel CLI entry point: parse, dispatch, exit code. 0 = ok, 1 = runtime error, 2 = usage error.
const { parseCli, UsageError } = require('./args');
const { help } = require('./commands/help');
const { version } = require('./commands/version');
const { sm } = require('./commands/sm');
const { pending } = require('./commands/stubs');
const { dashboard } = require('./commands/interactive');
const { pm } = require('./commands/pm');
const { init } = require('./commands/init');
const { importCommand } = require('./commands/import');

const HANDLERS = {
    help,
    version,
    sm,
    dashboard,
    pm,
    init,
    import: importCommand,
    doctor: pending('doctor'),
    update: pending('update'),
};

const defaultIo = () => ({ stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, cwd: process.cwd(), env: process.env });

/**
 * @param {string[]} argv
 * @param {{ stdout: { write: (s: string) => any }, stderr: { write: (s: string) => any }, stdin?: any, cwd: string, env: Record<string, any> }} [io]
 * @returns {Promise<number>} exit code
 */
async function main(argv, io = defaultIo()) {
    let parsed;
    try {
        parsed = parseCli(argv);
    } catch (err) {
        if (!(err instanceof UsageError)) throw err;
        io.stderr.write(`kestrel: ${err.message}\nRun "kestrel --help" for usage.\n`);
        return err.exitCode;
    }
    try {
        return await HANDLERS[parsed.command](parsed, io);
    } catch (err) {
        io.stderr.write(`kestrel: ${err.message}\n`);
        return 1;
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}

module.exports = { main };
