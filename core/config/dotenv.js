// Minimal, predictable .env parsing: KEY=VALUE, `export ` prefix, quotes, `#` comments.
// No variable interpolation in v1 (documented in BUILD_PLAN §8.2).
const fs = require('node:fs');

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const ESCAPES = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

/** Parses the value part. Returns { value } or { error }. */
function parseValue(raw) {
    const text = raw.trim();
    if (text.startsWith('"')) {
        let out = '';
        for (let i = 1; i < text.length; i++) {
            const ch = text[i];
            if (ch === '\\' && i + 1 < text.length) out += ESCAPES[text[++i]] ?? `\\${text[i]}`;
            else if (ch === '"') return { value: out };
            else out += ch;
        }
        return { error: 'unclosed double quote (multi-line values are not supported)' };
    }
    if (text.startsWith("'")) {
        const end = text.indexOf("'", 1);
        return end === -1 ? { error: 'unclosed single quote' } : { value: text.slice(1, end) };
    }
    // Unquoted: a "#" starts a comment only after whitespace, so URLs with fragments survive.
    return { value: text.replace(/\s+#.*$/, '').trim() };
}

/**
 * @param {string} text
 * @returns {{ vars: Record<string, string>, warnings: { line: number, message: string }[] }}
 */
function parseDotenv(text) {
    /** @type {Record<string, string>} */
    const vars = {};
    const warnings = [];
    const warn = (index, message) => warnings.push({ line: index + 1, message });
    for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const body = line.replace(/^export\s+/, '');
        const eq = body.indexOf('=');
        if (eq === -1) {
            warn(index, 'expected KEY=value');
            continue;
        }
        const key = body.slice(0, eq).trim();
        if (!KEY_PATTERN.test(key)) {
            warn(index, `invalid variable name "${key}"`);
            continue;
        }
        const parsed = parseValue(body.slice(eq + 1));
        if (parsed.error) warn(index, parsed.error);
        else vars[key] = parsed.value;
    }
    return { vars, warnings };
}

/**
 * @param {{ path: string, optional: boolean }} envFile
 * @param {{ readFileSync?: typeof fs.readFileSync }} [deps]
 */
function loadEnvFile(envFile, { readFileSync = fs.readFileSync } = {}) {
    let text;
    try {
        text = readFileSync(envFile.path, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT' && envFile.optional) return { vars: {}, warnings: [] };
        if (err.code === 'ENOENT') throw new Error(`env file not found: ${envFile.path}`);
        throw new Error(`Cannot read env file ${envFile.path}: ${err.message}`);
    }
    return parseDotenv(String(text));
}

module.exports = { parseDotenv, loadEnvFile };
