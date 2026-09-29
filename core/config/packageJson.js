// Detects runnable scripts in package.json for the first-run picker (UI_SPEC §6.6).

const LOCKFILE_RUNNERS = [
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
];
// npm lifecycle scripts: never things you "run as a process".
const LIFECYCLE = new Set(['install', 'preinstall', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack']);
const LONG_RUNNING_NAME = /^(dev|start|serve|watch|worker)([:._-].*)?$/;
const LONG_RUNNING_COMMAND = /--watch\b|\bnodemon\b|\bwatch\b/;

function isHook(name, all) {
    const match = /^(pre|post)(.+)$/.exec(name);
    return Boolean(match && match[2] in all);
}

/**
 * @param {{ packageJsonText: string, files: string[] }} input  files = names present next to package.json
 * @returns {{ runner: string, scripts: { name: string, command: string, preselected: boolean }[] }}
 */
function detectScripts({ packageJsonText, files }) {
    let pkg;
    try {
        pkg = JSON.parse(packageJsonText);
    } catch (err) {
        throw new Error(`package.json is not valid JSON: ${err.message}`);
    }
    const runner = LOCKFILE_RUNNERS.find(([file]) => files.includes(file))?.[1] ?? 'npm';
    const all = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
    const scripts = Object.entries(all)
        .filter(([name, command]) => typeof command === 'string' && !LIFECYCLE.has(name) && !isHook(name, all))
        .map(([name, command]) => ({
            name,
            command,
            preselected: LONG_RUNNING_NAME.test(name) || LONG_RUNNING_COMMAND.test(command),
        }));
    return { runner, scripts };
}

/** Script name → valid process name ("dev:api" → "dev-api"). */
function toProcessName(script) {
    return script.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 64) || 'script';
}

/** Selected script names → a raw kestrel.json object. */
function scriptsToConfig(runner, names) {
    const processes = {};
    for (const name of names) processes[toProcessName(name)] = { cmd: `${runner} run ${name}` };
    return { version: 1, processes };
}

module.exports = { detectScripts, scriptsToConfig, toProcessName };
