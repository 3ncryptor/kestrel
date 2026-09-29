// Finds and loads the project's stack (PRD §5.2). First match wins:
//   --config <path>  →  kestrel.json (walking up)  →  Procfile (cwd)  →  package.json scripts (cwd)
const fs = require('node:fs');
const path = require('node:path');
const { validateConfig } = require('./schema');
const { parseProcfile } = require('./procfile');
const { detectScripts } = require('./packageJson');

const CONFIG_FILE = 'kestrel.json';

/** Nearest `filename` from `startDir` upwards (like git), or null. */
function findUp(startDir, filename, { stopAt = path.parse(startDir).root } = {}) {
    let dir = path.resolve(startDir);
    for (;;) {
        const candidate = path.join(dir, filename);
        if (fs.existsSync(candidate)) return candidate;
        if (dir === stopAt || dir === path.dirname(dir)) return null;
        dir = path.dirname(dir);
    }
}

/**
 * @typedef {Object} StackResult
 * @property {'kestrel.json'|'Procfile'|'package.json'|null} source
 * @property {string|null} path
 * @property {any} config  normalized config (see schema.js), or null
 * @property {{ path: string, message: string }[]} errors
 * @property {string[]} warnings
 * @property {any} detected  package.json scripts, when source is 'package.json'
 */

/** @returns {StackResult} */
const emptyResult = () => ({ source: null, path: null, config: null, errors: [], warnings: [], detected: null });

/** @returns {StackResult} */
function loadKestrelJson(file) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
        return { ...emptyResult(), source: 'kestrel.json', path: file, errors: [{ path: '(file)', message: `not valid JSON: ${err.message}` }] };
    }
    const { config, errors } = validateConfig(raw, { baseDir: path.dirname(file) });
    return { ...emptyResult(), source: 'kestrel.json', path: file, config, errors };
}

/** @returns {StackResult} */
function loadProcfile(file) {
    const { processes, warnings } = parseProcfile(fs.readFileSync(file, 'utf-8'));
    const { config, errors } = validateConfig({ version: 1, processes }, { baseDir: path.dirname(file) });
    return {
        ...emptyResult(),
        source: 'Procfile',
        path: file,
        config,
        errors,
        warnings: warnings.map((w) => `Procfile line ${w.line}: ${w.message}`),
    };
}

/** @returns {StackResult} */
function loadPackageJson(file) {
    const detected = detectScripts({ packageJsonText: fs.readFileSync(file, 'utf-8'), files: fs.readdirSync(path.dirname(file)) });
    return { ...emptyResult(), source: 'package.json', path: file, detected };
}

/**
 * @param {{ cwd: string, configPath?: string, stopAt?: string }} options
 * @returns {StackResult}
 */
function loadStack({ cwd, configPath, stopAt }) {
    if (configPath) {
        const file = path.resolve(cwd, configPath);
        if (!fs.existsSync(file)) throw new Error(`Config file not found: ${file}`);
        return loadKestrelJson(file);
    }
    const kestrelJson = findUp(cwd, CONFIG_FILE, { stopAt });
    if (kestrelJson) return loadKestrelJson(kestrelJson);
    const procfile = path.join(cwd, 'Procfile');
    if (fs.existsSync(procfile)) return loadProcfile(procfile);
    const packageJson = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJson)) return loadPackageJson(packageJson);
    return emptyResult();
}

module.exports = { loadStack, findUp, CONFIG_FILE };
