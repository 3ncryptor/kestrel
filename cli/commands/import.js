// `kestrel import pm2 [file]` (PRD §5.2): converts a pm2 setup (running pm2, or an ecosystem file) into
// kestrel.json. It never starts anything, and a .js ecosystem file is only executed after a yes.
const fs = require('node:fs');
const path = require('node:path');
const { importPm2 } = require('../../core/config/pm2');
const { writeConfigFile } = require('../../core/config/save');
const { createPrompter, createAutoPrompter } = require('../prompt');
const { processCount } = require('./init');

const CONFIG_FILE = 'kestrel.json';

/** @param {{ options: any, positionals: string[] }} parsed @param {{ stdout: any, stderr: any, stdin?: any, cwd: string }} io */
async function importCommand(parsed, io) {
    const target = path.join(io.cwd, CONFIG_FILE);
    if (!parsed.options.force && fs.existsSync(target)) {
        io.stderr.write(`kestrel: ${target} already exists. Use --force to replace it.\n`);
        return 1;
    }
    const prompter = parsed.options.yes ? createAutoPrompter(io) : createPrompter({ stdin: io.stdin ?? process.stdin, stdout: io.stdout });
    try {
        const { source, config, warnings } = await importPm2({
            cwd: io.cwd,
            file: parsed.positionals[1],
            confirm: (message) => prompter.confirm(message, false),
        });
        const names = Object.keys(config.processes);
        if (!names.length) {
            io.stderr.write(`kestrel: No apps to import from ${source}\n`);
            return 1;
        }
        writeConfigFile(target, config, { force: true });
        io.stdout.write(`Imported ${processCount(names.length)} from ${source}: ${names.join(', ')}\n`);
        for (const w of warnings) io.stdout.write(`  ! ${w}\n`);
        io.stdout.write('Wrote kestrel.json. Nothing was started; review it, then run: kestrel pm\n');
        return 0;
    } finally {
        prompter.close();
    }
}

module.exports = { importCommand };
