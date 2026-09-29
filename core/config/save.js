// Writes kestrel.json (saveAdHoc, the package.json picker, `kestrel init`, `kestrel import pm2`).
// Every write is validated first, so Kestrel never saves a config it could not load again.
const nodeFs = require('node:fs');
const path = require('node:path');
const { validateConfig } = require('./schema');

const serialize = (raw) => `${JSON.stringify(raw, null, 2)}\n`;

/**
 * @param {string} file
 * @param {any} raw  a kestrel.json object
 * @param {{ force?: boolean, fs?: any }} [options]
 */
function writeConfigFile(file, raw, { force = false, fs = nodeFs } = {}) {
    const { errors } = validateConfig(raw, { baseDir: path.dirname(file) });
    if (errors.length) {
        throw new Error(`The config would not load: ${errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
    }
    if (!force && fs.existsSync(file)) {
        throw Object.assign(new Error(`${file} already exists (use --force to overwrite)`), { code: 'EEXIST' });
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, serialize(raw));
    fs.renameSync(tmp, file); // atomic replace: never a half-written config
}

/** Adds one process to `file`, creating it when missing. @returns the new raw config */
function addProcess(file, name, entry, { fs = nodeFs } = {}) {
    let raw = { version: 1, processes: {} };
    if (fs.existsSync(file)) {
        try {
            raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (err) {
            throw new Error(`${path.basename(file)} is not valid JSON (${err.message}); fix it before saving to it`);
        }
    }
    if (raw.processes && Object.hasOwn(raw.processes, name)) throw new Error(`"${name}" is already in ${path.basename(file)}`);
    const next = { ...raw, processes: { ...(raw.processes || {}), [name]: entry } };
    writeConfigFile(file, next, { force: true, fs });
    return next;
}

/** A managed definition → the smallest kestrel.json entry that recreates it. A cwd inside the
 *  project is saved relative (the project can move); one outside it stays absolute. */
function toConfigEntry(def, baseDir) {
    const relative = path.relative(baseDir, def.cwd);
    const cwd = relative.startsWith('..') || path.isAbsolute(relative) ? def.cwd : relative;
    const env = def.env || {};
    return { cmd: def.cmd, ...(cwd ? { cwd } : {}), ...(Object.keys(env).length ? { env } : {}) };
}

module.exports = { writeConfigFile, addProcess, toConfigEntry };
