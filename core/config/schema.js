// Validates and normalizes kestrel.json (BUILD_PLAN §8.2). Collects EVERY error with its path,
// so a user fixes the whole file in one pass instead of one error per run.
const path = require('node:path');
const { isValidName } = require('../names');
const { findCycle, startWaves } = require('../stack/graph');
const { DEFAULT_THRESHOLDS } = require('../store/state');

const TOP_KEYS = new Set(['$schema', 'version', 'processes', 'monitor']);
const PROCESS_KEYS = new Set(['cmd', 'cwd', 'env', 'envFile', 'dependsOn', 'ready', 'restart', 'maxRestarts', 'stopSignal', 'stopTimeoutMs']);
const READY_KINDS = ['port', 'http', 'log'];
const RESTART_POLICIES = ['on-failure', 'always', 'never'];
const STOP_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2'];
const DEFAULTS = Object.freeze({ restart: 'on-failure', maxRestarts: 10, stopSignal: 'SIGTERM', stopTimeoutMs: 5000, readyTimeoutMs: 60000, intervalMs: 1000 });
const INTERVAL_RANGE = [250, 60000];
const MAX_PORT = 65535;

/** @typedef {{ path: string, message: string }} ConfigError */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

function rejectUnknownKeys(obj, allowed, prefix, add) {
    for (const k of Object.keys(obj)) if (!allowed.has(k)) add(prefix ? `${prefix}.${k}` : k, 'unknown key');
}

function normalizeEnv(env, p, add) {
    if (env === undefined) return {};
    if (!isObject(env)) {
        add(p, 'must be an object of NAME: value pairs');
        return {};
    }
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (!['string', 'number', 'boolean'].includes(typeof value)) add(`${p}.${key}`, 'must be a string, number or boolean');
        else out[key] = String(value);
    }
    return out;
}

function normalizeReady(ready, p, add) {
    if (ready === undefined) return null;
    if (!isObject(ready)) {
        add(p, 'must be an object like { "port": 3000 }');
        return null;
    }
    const kinds = READY_KINDS.filter((k) => k in ready);
    rejectUnknownKeys(ready, new Set([...READY_KINDS, 'timeoutMs']), p, add);
    if (kinds.length !== 1) {
        add(p, 'must contain exactly one of "port", "http" or "log"');
        return null;
    }
    const kind = kinds[0];
    const target = ready[kind];
    if (kind === 'port' && !(Number.isInteger(target) && target > 0 && target <= MAX_PORT)) add(`${p}.port`, `must be a port number (1-${MAX_PORT})`);
    if (kind === 'http' && !(typeof target === 'string' && /^https?:\/\/\S+$/.test(target))) add(`${p}.http`, 'must be an http:// or https:// URL');
    if (kind === 'log') {
        try {
            if (typeof target !== 'string' || !target) throw new Error('empty');
            new RegExp(target);
        } catch {
            add(`${p}.log`, 'must be a text or regular expression to look for in the output');
        }
    }
    const timeoutMs = ready.timeoutMs ?? DEFAULTS.readyTimeoutMs;
    if (!isPositiveInt(timeoutMs)) add(`${p}.timeoutMs`, 'must be a positive whole number of milliseconds');
    return { kind, target, timeoutMs };
}

function checkEnum(value, allowed, p, add, fallback) {
    if (value === undefined) return fallback;
    if (!allowed.includes(value)) add(p, `must be one of: ${allowed.join(', ')}`);
    return value;
}

function checkInt(value, p, add, fallback, { min = 1 } = {}) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < min) add(p, `must be a whole number ≥ ${min}`);
    return value;
}

function normalizeProcess(name, raw, baseDir, add) {
    const p = `processes.${name}`;
    if (!isValidName(name)) add(p, 'names may only use letters, digits, ".", "_" and "-" (max 64)');
    if (!isObject(raw)) {
        add(p, 'must be an object like { "cmd": "npm start" }');
        return null;
    }
    rejectUnknownKeys(raw, PROCESS_KEYS, p, add);
    if (raw.cmd === undefined) add(`${p}.cmd`, 'required');
    else if (typeof raw.cmd !== 'string' || !raw.cmd.trim()) add(`${p}.cmd`, 'must be a non-empty command');
    if (raw.cwd !== undefined && typeof raw.cwd !== 'string') add(`${p}.cwd`, 'must be a path');
    if (raw.envFile !== undefined && typeof raw.envFile !== 'string') add(`${p}.envFile`, 'must be a path');

    const cwd = path.resolve(baseDir, typeof raw.cwd === 'string' ? raw.cwd : '.');
    return {
        name,
        cmd: typeof raw.cmd === 'string' ? raw.cmd.trim() : '',
        cwd,
        env: normalizeEnv(raw.env, `${p}.env`, add),
        envFile: typeof raw.envFile === 'string'
            ? { path: path.resolve(cwd, raw.envFile), optional: false }
            : { path: path.join(cwd, '.env'), optional: true },
        dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
        ready: normalizeReady(raw.ready, `${p}.ready`, add),
        restart: checkEnum(raw.restart, RESTART_POLICIES, `${p}.restart`, add, DEFAULTS.restart),
        maxRestarts: checkInt(raw.maxRestarts, `${p}.maxRestarts`, add, DEFAULTS.maxRestarts, { min: 0 }),
        stopSignal: checkEnum(raw.stopSignal, STOP_SIGNALS, `${p}.stopSignal`, add, DEFAULTS.stopSignal),
        stopTimeoutMs: checkInt(raw.stopTimeoutMs, `${p}.stopTimeoutMs`, add, DEFAULTS.stopTimeoutMs),
        rawDependsOn: raw.dependsOn,
    };
}

/** Returns true when every dependsOn entry is valid (so cycle detection is meaningful). */
function checkDependencies(processes, add) {
    const names = new Set(processes.map((p) => p.name));
    let valid = true;
    for (const proc of processes) {
        const p = `processes.${proc.name}.dependsOn`;
        if (proc.rawDependsOn === undefined) continue;
        if (!Array.isArray(proc.rawDependsOn)) {
            add(p, 'must be a list of process names');
            valid = false;
            continue;
        }
        proc.rawDependsOn.forEach((dep, i) => {
            const problem = typeof dep !== 'string' ? 'must be a process name'
                : dep === proc.name ? 'a process cannot depend on itself'
                : !names.has(dep) ? `unknown process "${dep}"` : null;
            if (problem) {
                add(`${p}[${i}]`, problem);
                valid = false;
            }
        });
    }
    return valid;
}

function normalizeThresholds(raw, add) {
    if (raw === undefined) return { ...DEFAULT_THRESHOLDS };
    if (!isObject(raw)) {
        add('monitor.thresholds', 'must be an object');
        return { ...DEFAULT_THRESHOLDS };
    }
    rejectUnknownKeys(raw, new Set(['cpu', 'memMB']), 'monitor.thresholds', add);
    const pair = (key) => {
        const value = raw[key];
        if (value === undefined) return DEFAULT_THRESHOLDS[key];
        const ok = Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && n > 0) && value[0] < value[1];
        if (!ok) add(`monitor.thresholds.${key}`, 'must be [warn, danger] with 0 < warn < danger');
        return value;
    };
    return { cpu: pair('cpu'), memMB: pair('memMB') };
}

function normalizeMonitor(raw, add) {
    if (raw === undefined) return { intervalMs: DEFAULTS.intervalMs, thresholds: { ...DEFAULT_THRESHOLDS } };
    if (!isObject(raw)) {
        add('monitor', 'must be an object');
        return { intervalMs: DEFAULTS.intervalMs, thresholds: { ...DEFAULT_THRESHOLDS } };
    }
    rejectUnknownKeys(raw, new Set(['intervalMs', 'thresholds']), 'monitor', add);
    const intervalMs = raw.intervalMs ?? DEFAULTS.intervalMs;
    const [min, max] = INTERVAL_RANGE;
    if (!Number.isInteger(intervalMs) || intervalMs < min || intervalMs > max) add('monitor.intervalMs', `must be between ${min} and ${max} ms`);
    return { intervalMs, thresholds: normalizeThresholds(raw.thresholds, add) };
}

/**
 * @param {unknown} raw  parsed JSON
 * @param {{ baseDir: string }} options  directory of the config file (relative paths resolve from here)
 * @returns {{ ok: boolean, config: any, errors: ConfigError[] }}
 */
function validateConfig(raw, { baseDir }) {
    /** @type {ConfigError[]} */
    const errors = [];
    const add = (p, message) => errors.push({ path: p, message });
    if (!isObject(raw)) return { ok: false, config: null, errors: [{ path: '(root)', message: 'must be a JSON object' }] };
    const obj = /** @type {Record<string, any>} */ (raw);

    rejectUnknownKeys(obj, TOP_KEYS, '', add);
    if (obj.version !== 1) add('version', 'must be 1');
    if (!isObject(obj.processes) || !Object.keys(obj.processes).length) {
        add('processes', 'must list at least one process, e.g. { "api": { "cmd": "npm start" } }');
    }
    const entries = isObject(obj.processes) ? Object.entries(obj.processes) : [];
    const processes = entries.map(([name, value]) => normalizeProcess(name, value, baseDir, add)).filter((p) => p !== null);
    const depsValid = checkDependencies(processes, add);
    const cycle = depsValid ? findCycle(processes) : null;
    if (cycle) add('processes', `dependency cycle: ${cycle.join(' → ')}`);
    const monitor = normalizeMonitor(obj.monitor, add);

    if (errors.length) return { ok: false, config: null, errors };
    const clean = processes.map(({ rawDependsOn, ...rest }) => rest);
    return { ok: true, config: { version: 1, processes: clean, monitor, startOrder: startWaves(clean) }, errors };
}

module.exports = { validateConfig, RESTART_POLICIES, STOP_SIGNALS, DEFAULTS };
