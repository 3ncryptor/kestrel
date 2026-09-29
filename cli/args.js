// Command-line parsing (BUILD_PLAN §8.7). Pure: argv in, parsed command out, or a UsageError.
const { parseArgs } = require('util');

const COMMANDS = Object.freeze(['dashboard', 'pm', 'sm', 'init', 'import', 'doctor', 'update', 'help', 'version']);
// Unix reads `-pm` as `-p -m`, so these aliases are rewritten before parseArgs ever sees them.
const ALIASES = Object.freeze({ '-pm': 'pm', '--pm': 'pm', '-sm': 'sm', '--sm': 'sm' });
const TICKS_RANGE = [1, 100];
const INTERVAL_RANGE = [250, 60000];

const OPTIONS = {
    config: { type: 'string' },
    only: { type: 'string' },
    'no-color': { type: 'boolean' },
    dump: { type: 'boolean' },
    ticks: { type: 'string' },
    interval: { type: 'string' },
    force: { type: 'boolean' },
    yes: { type: 'boolean', short: 'y' },
    check: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
};

class UsageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UsageError';
        this.exitCode = 2;
    }
}

/** @param {string} value @param {number[]} range @param {string} flag */
function intInRange(value, range, flag) {
    const [min, max] = range;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`${flag} must be a whole number from ${min} to ${max}`);
    return n;
}

function readRaw(argv) {
    try {
        return parseArgs({ args: argv.map((a) => ALIASES[a] ?? a), options: /** @type {any} */ (OPTIONS), allowPositionals: true, strict: true });
    } catch (err) {
        const message = String(err.message).replace(/\. To specify a positional argument.*$/s, '');
        throw new UsageError(/Unknown option/.test(message) ? message : `Invalid arguments: ${message}`);
    }
}

function checkCombinations(command, values, positionals) {
    if (values.dump && command !== 'sm') throw new UsageError('--dump only works with "sm"');
    if (values.ticks !== undefined && !values.dump) throw new UsageError('--ticks needs --dump');
    if (values.only !== undefined && command !== 'pm') throw new UsageError('--only only works with "pm"');
    const writesConfig = command === 'init' || command === 'import';
    if (values.force && !writesConfig) throw new UsageError('--force only works with "init" and "import"');
    if (values.yes && !writesConfig) throw new UsageError('--yes only works with "init" and "import"');
    if (values.check && command !== 'update') throw new UsageError('--check only works with "update"');
    if (command === 'import' && positionals[0] !== 'pm2') throw new UsageError('Usage: kestrel import pm2 [ecosystem-file]');
    const allowed = command === 'import' ? 2 : 0;
    if (positionals.length > allowed) throw new UsageError(`Unexpected argument "${positionals[allowed]}"`);
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ command: string, options: { config: string|null, only: string[], noColor: boolean,
 *             dump: boolean, ticks: number, intervalMs: number|null, force: boolean, yes: boolean, check: boolean }, positionals: string[] }}
 */
function parseCli(argv) {
    const { values, positionals } = /** @type {{ values: Record<string, any>, positionals: string[] }} */ (readRaw(argv));
    const [first, ...rest] = positionals;
    const command = values.help ? 'help' : values.version ? 'version' : first ?? 'dashboard';
    if (!COMMANDS.includes(command)) throw new UsageError(`Unknown command "${command}"`);
    if (command === 'help' || command === 'version') return { command, options: defaults(), positionals: [] };

    checkCombinations(command, values, rest);
    return {
        command,
        positionals: rest,
        options: {
            config: values.config ?? null,
            only: values.only ? values.only.split(',').map((s) => s.trim()).filter(Boolean) : [],
            noColor: Boolean(values['no-color']),
            dump: Boolean(values.dump),
            ticks: values.ticks === undefined ? 1 : intInRange(values.ticks, TICKS_RANGE, '--ticks'),
            intervalMs: values.interval === undefined ? null : intInRange(values.interval, INTERVAL_RANGE, '--interval'),
            force: Boolean(values.force),
            yes: Boolean(values.yes),
            check: Boolean(values.check),
        },
    };
}

const defaults = () => ({ config: null, only: [], noColor: false, dump: false, ticks: 1, intervalMs: null, force: false, yes: false, check: false });

module.exports = { parseCli, UsageError, COMMANDS, ALIASES };
