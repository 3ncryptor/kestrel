// `kestrel pm [--config] [--only a,b]` (PRD §5.1): checks the stack, then opens the dashboard with the
// stack starting and the managed box focused. Config problems exit 2 before any UI, so `kestrel pm`
// also works as a config check in scripts and CI.
const { loadStack } = require('../../core/config');
const { runUi } = require('./interactive');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describeProblems(stack) {
    const width = Math.max(...stack.errors.map((e) => e.path.length));
    const lines = stack.errors.map((e) => `  ${e.path.padEnd(width)}  ${e.message}`);
    return `kestrel: kestrel.json has ${plural(stack.errors.length, 'problem')} (${stack.path}):\n${lines.join('\n')}\n`;
}

/** @returns {{ code: number, message: string } | null} */
function checkStack(stack, only, cwd) {
    if (stack.errors.length) return { code: 2, message: describeProblems(stack) };
    if (!stack.source) {
        return { code: 1, message: `kestrel: No stack here (no kestrel.json, Procfile or package.json in ${cwd}).\nCreate one with: kestrel init\n` };
    }
    if (stack.source === 'package.json' && !stack.detected.scripts.length) {
        return { code: 1, message: 'kestrel: package.json has no scripts to run.\nCreate kestrel.json with: kestrel init\n' };
    }
    if (!only.length) return null;
    if (!stack.config) return { code: 2, message: 'kestrel: --only needs a kestrel.json or Procfile (pick package.json scripts in the UI)\n' };
    const names = stack.config.processes.map((p) => p.name);
    const unknown = only.find((n) => !names.includes(n));
    return unknown ? { code: 2, message: `kestrel: Unknown process "${unknown}" (the stack has: ${names.join(', ')})\n` } : null;
}

/** @param {{ options: any }} parsed @param {{ stdout: any, stderr: any, cwd: string, env: Record<string, any> }} io */
async function pm(parsed, io) {
    const stack = loadStack({ cwd: io.cwd, configPath: parsed.options.config ?? undefined });
    const problem = checkStack(stack, parsed.options.only, io.cwd);
    if (problem) {
        io.stderr.write(problem.message);
        return problem.code;
    }
    const only = parsed.options.only.length ? parsed.options.only : undefined;
    // A package.json project has nothing to start yet: the UI opens its script picker instead.
    const startStack = stack.config ? { only } : null;
    return runUi({ managerAvailable: true, focus: 'managed', startStack }, parsed, io, stack);
}

module.exports = { pm, checkStack };
