// Environment for a managed process (PRD P9): inherited < envFile < inline env.
const fs = require('node:fs');
const { loadEnvFile } = require('../config/dotenv');

/**
 * @param {{ env?: Record<string, string>, envFile?: { path: string, optional: boolean } | null }} def
 * @param {{ baseEnv?: Record<string, string|undefined>, readFileSync?: any }} [deps]
 * @returns {{ env: Record<string, string|undefined>, own: Record<string, string>, warnings: string[] }}
 *   `own` is what the stack adds (file + inline), for the masked env view; `env` is what the child gets.
 * @throws when an explicitly configured envFile is missing
 */
function resolveEnv(def, { baseEnv = process.env, readFileSync = fs.readFileSync } = {}) {
    let fileVars = {};
    const warnings = [];
    const envFile = def.envFile;
    if (envFile) {
        const loaded = loadEnvFile(envFile, { readFileSync });
        fileVars = loaded.vars;
        warnings.push(...loaded.warnings.map((w) => `${envFile.path} line ${w.line}: ${w.message}`));
    }
    const own = { ...fileVars, ...(def.env || {}) };
    return { env: { ...baseEnv, ...own }, own, warnings };
}

module.exports = { resolveEnv };
