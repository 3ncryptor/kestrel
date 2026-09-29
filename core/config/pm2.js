// `kestrel import pm2`: converts a running pm2 setup (preferred: plain data) or an ecosystem file
// into a kestrel.json object. It only produces config, and never starts anything.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const { toProcessName } = require('./packageJson');

const ECOSYSTEM_FILES = ['ecosystem.config.js', 'ecosystem.config.cjs', 'ecosystem.config.json'];
const JS_SCRIPT = /\.(c|m)?js$/;
const SAFE_ARG = /^[\w@%+=:,./-]+$/;

const defaultExec = (file, args) => util.promisify(execFile)(file, args, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });

/** Shell-quotes one argument only when it needs it. */
function quoteArg(arg) {
    return SAFE_ARG.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}

function toArgs(args) {
    if (Array.isArray(args)) return args.map(String);
    if (typeof args === 'string') return args.split(/\s+/).filter(Boolean);
    return [];
}

function buildCmd({ script, args, interpreter }) {
    const interp = interpreter === 'none' ? null : interpreter || (JS_SCRIPT.test(script) ? 'node' : null);
    return [interp, script, ...toArgs(args)].filter(Boolean).map((part) => quoteArg(String(part))).join(' ');
}

function uniqueName(base, used) {
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    return name;
}

function unsupportedWarnings(name, app) {
    const warnings = [];
    const instances = app.instances;
    const multi = instances === 'max' || instances === -1 || (Number.isInteger(instances) && instances > 1);
    if (multi || String(app.exec_mode || '').includes('cluster')) {
        warnings.push(`${name}: cluster mode / instances=${instances ?? 1} is not supported; Kestrel runs a single instance`);
    }
    if (app.watch) warnings.push(`${name}: watch is not supported yet; use your tool's own watch mode (e.g. nodemon, tsx watch)`);
    if (app.cron_restart) warnings.push(`${name}: cron_restart is not supported and was skipped`);
    for (const k of Object.keys(app).filter((key) => /^env_/.test(key))) warnings.push(`${name}: ${k} was not imported (put per-environment values in .env files)`);
    return warnings;
}

function stringifyEnv(env) {
    return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)]));
}

/** One pm2 app (ecosystem shape) → [name, kestrel process entry, warnings]. */
function mapApp(app, used, { includeEnv }) {
    const base = toProcessName(app.name || path.basename(String(app.script || 'app'), path.extname(String(app.script || ''))));
    const name = uniqueName(base, used);
    const entry = {
        cmd: buildCmd(app),
        ...(app.cwd ? { cwd: app.cwd } : {}),
        ...(includeEnv && app.env && typeof app.env === 'object' ? { env: stringifyEnv(app.env) } : {}),
        restart: app.autorestart === false ? 'never' : 'always', // pm2 restarts on any exit by default
        ...(Number.isInteger(app.max_restarts) ? { maxRestarts: app.max_restarts } : {}),
    };
    return { name, entry, warnings: unsupportedWarnings(name, app) };
}

function toConfig(apps, options) {
    const used = new Set();
    const processes = {};
    const warnings = [];
    for (const app of apps) {
        if (!app?.script) {
            warnings.push(`skipped an app without a "script"`);
            continue;
        }
        const mapped = mapApp(app, used, options);
        processes[mapped.name] = mapped.entry;
        warnings.push(...mapped.warnings);
    }
    return { config: { version: 1, processes }, warnings };
}

/** @param {any} ecosystem  the exported object ({ apps: [...] }) or a bare array of apps */
function fromEcosystem(ecosystem) {
    const apps = Array.isArray(ecosystem) ? ecosystem : ecosystem?.apps;
    if (!Array.isArray(apps)) throw new Error('The ecosystem file has no "apps" list');
    return toConfig(apps, { includeEnv: true });
}

/** @param {string} text  output of `pm2 jlist` */
function fromJlist(text) {
    const list = JSON.parse(text);
    const apps = list.map((p) => ({
        name: p.name,
        script: p.pm2_env?.pm_exec_path,
        args: p.pm2_env?.args,
        cwd: p.pm2_env?.pm_cwd,
        interpreter: p.pm2_env?.exec_interpreter,
        autorestart: p.pm2_env?.autorestart,
        max_restarts: p.pm2_env?.max_restarts,
        exec_mode: p.pm2_env?.exec_mode,
        instances: p.pm2_env?.instances,
        watch: p.pm2_env?.watch,
        cron_restart: p.pm2_env?.cron_restart,
    }));
    // pm2 reports the daemon's FULL environment per app; copying it would leak unrelated secrets.
    const result = toConfig(apps, { includeEnv: false });
    const envWarning = 'env from the running pm2 daemon was not imported (it holds the whole daemon environment); put the variables your apps need in .env';
    return { config: result.config, warnings: apps.length ? [...result.warnings, envWarning] : result.warnings };
}

/**
 * Reads an ecosystem file. JavaScript files must be executed to be read (pm2 does the same),
 * so that only happens after `confirm` agrees.
 * @param {string} file
 * @param {{ confirm: (message: string) => Promise<boolean> }} deps
 */
async function loadEcosystemFile(file, { confirm }) {
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (file.endsWith('.mjs')) throw new Error('ES module ecosystem files (.mjs) are not supported; use .js/.cjs or .json');
    const ok = await confirm(`Reading ${path.basename(file)} will execute it as JavaScript, the same way pm2 does. Continue?`);
    if (!ok) throw new Error('Import cancelled');
    const resolved = require.resolve(path.resolve(file));
    delete require.cache[resolved];
    return require(resolved);
}

/**
 * @param {{ cwd: string, file?: string, exec?: (f: string, a: string[]) => Promise<{ stdout: string }>,
 *           confirm: (message: string) => Promise<boolean> }} options
 * @returns {Promise<{ source: string, config: any, warnings: string[] }>}
 */
async function importPm2({ cwd, file, exec = defaultExec, confirm }) {
    if (file) {
        const abs = path.resolve(cwd, file);
        return { source: abs, ...fromEcosystem(await loadEcosystemFile(abs, { confirm })) };
    }
    try {
        const { stdout } = await exec('pm2', ['jlist']);
        const running = fromJlist(stdout);
        if (Object.keys(running.config.processes).length) return { source: 'pm2 jlist', ...running };
    } catch (err) {
        if (err.code !== 'ENOENT') throw new Error(`pm2 jlist failed: ${err.message}`);
    }
    const found = ECOSYSTEM_FILES.map((f) => path.join(cwd, f)).find((f) => fs.existsSync(f));
    if (!found) throw new Error(`No running pm2 and no ecosystem file found in ${cwd}`);
    return { source: found, ...fromEcosystem(await loadEcosystemFile(found, { confirm })) };
}

module.exports = { importPm2, fromJlist, fromEcosystem, loadEcosystemFile, quoteArg, buildCmd, ECOSYSTEM_FILES };
