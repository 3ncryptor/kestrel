// `kestrel init` (PRD §5.2): writes kestrel.json from what the project already has, in the same order
// Kestrel looks for a stack: a Procfile, then package.json scripts, else a command typed at the prompt.
const fs = require('node:fs');
const path = require('node:path');
const { parseProcfile } = require('../../core/config/procfile');
const { detectScripts, scriptsToConfig } = require('../../core/config/packageJson');
const { writeConfigFile } = require('../../core/config/save');
const { deriveId } = require('../../core/processManager/groups');
const { createPrompter, createAutoPrompter } = require('../prompt');

const CONFIG_FILE = 'kestrel.json';
const IGNORE_ENTRY = '.kestrel/';

const processCount = (n) => `${n} process${n === 1 ? '' : 'es'}`;

function fromProcfile(file, io) {
    const { processes, warnings } = parseProcfile(fs.readFileSync(file, 'utf-8'));
    for (const w of warnings) io.stdout.write(`  ! Procfile line ${w.line}: ${w.message}\n`);
    if (!Object.keys(processes).length) return null;
    io.stdout.write('Using the Procfile.\n');
    return { version: 1, processes };
}

/** "1, 3" → [1, 3]; anything that is not a listed number is refused. */
function parseChoice(answer, count) {
    const tokens = answer.split(/[\s,]+/).filter(Boolean);
    const bad = tokens.find((t) => !/^\d+$/.test(t) || Number(t) < 1 || Number(t) > count);
    if (bad !== undefined) throw new Error(`No script number ${bad}; nothing was written`);
    return [...new Set(tokens.map(Number))];
}

async function fromPackageJson(file, prompter, io) {
    const dir = path.dirname(file);
    const { runner, scripts } = detectScripts({ packageJsonText: fs.readFileSync(file, 'utf-8'), files: fs.readdirSync(dir) });
    if (!scripts.length) return null;
    const width = Math.max(...scripts.map((s) => s.name.length));
    io.stdout.write(`package.json scripts (run with ${runner}):\n`);
    for (const [i, s] of scripts.entries()) io.stdout.write(`  ${i + 1}. [${s.preselected ? 'x' : ' '}] ${s.name.padEnd(width)}  ${s.command}\n`);
    const defaults = scripts.flatMap((s, i) => (s.preselected ? [i + 1] : []));
    const answer = (await prompter.ask(`Scripts to run, e.g. 1,3 [${defaults.join(',') || 'none'}]: `)) ?? '';
    const picked = answer.trim() ? parseChoice(answer, scripts.length) : defaults;
    if (!picked.length) throw new Error('No scripts chosen; nothing was written');
    return scriptsToConfig(runner, picked.map((n) => scripts[n - 1].name));
}

async function fromCommand(prompter) {
    const cmd = ((await prompter.ask('Command to run (e.g. npm start): ')) ?? '').trim();
    return cmd ? { version: 1, processes: { [deriveId(cmd)]: { cmd } } } : null;
}

async function detect(cwd, prompter, io) {
    const procfile = path.join(cwd, 'Procfile');
    const fromFile = fs.existsSync(procfile) ? fromProcfile(procfile, io) : null;
    if (fromFile) return fromFile;
    const packageJson = path.join(cwd, 'package.json');
    const fromScripts = fs.existsSync(packageJson) ? await fromPackageJson(packageJson, prompter, io) : null;
    return fromScripts || fromCommand(prompter);
}

/** Logs and run state live in .kestrel/: offer to keep them out of git (only in a git project). */
async function offerGitignore(cwd, prompter, io) {
    const file = path.join(cwd, '.gitignore');
    const exists = fs.existsSync(file);
    if (!exists && !fs.existsSync(path.join(cwd, '.git'))) return;
    const content = exists ? fs.readFileSync(file, 'utf-8') : '';
    if (/^\/?\.kestrel\/?\s*$/m.test(content)) return;
    if (!(await prompter.confirm('Add .kestrel/ (logs and run state) to .gitignore?', true))) return;
    const separator = content && !content.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, `${content}${separator}${IGNORE_ENTRY}\n`);
    io.stdout.write('Added .kestrel/ to .gitignore\n');
}

/** @param {{ options: any }} parsed @param {{ stdout: any, stderr: any, stdin?: any, cwd: string }} io */
async function init(parsed, io) {
    const target = path.join(io.cwd, CONFIG_FILE);
    if (!parsed.options.force && fs.existsSync(target)) {
        io.stderr.write(`kestrel: ${target} already exists. Use --force to replace it.\n`);
        return 1;
    }
    const prompter = parsed.options.yes ? createAutoPrompter(io) : createPrompter({ stdin: io.stdin ?? process.stdin, stdout: io.stdout });
    try {
        const raw = await detect(io.cwd, prompter, io);
        if (!raw) {
            io.stderr.write('kestrel: Nothing to put in kestrel.json: no Procfile or package.json scripts here, and no command entered.\n');
            return 1;
        }
        writeConfigFile(target, raw, { force: true });
        const names = Object.keys(raw.processes);
        io.stdout.write(`Created kestrel.json with ${processCount(names.length)}: ${names.join(', ')}\n`);
        await offerGitignore(io.cwd, prompter, io);
        io.stdout.write('Start them with: kestrel pm\n');
        return 0;
    } finally {
        prompter.close();
    }
}

module.exports = { init, parseChoice, processCount };
