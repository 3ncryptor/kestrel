// Bounded, in-memory log buffer for one managed process. Splits raw stream chunks into lines
// (holding back a trailing partial line per stream) and keeps only the newest `maxLines`.

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_QUERY_LIMIT = 200;
const MAX_FILTER_LENGTH = 200;

/** @typedef {'stdout'|'stderr'|'system'} LogStream */
/** @typedef {{ seq: number, ts: number, stream: LogStream, text: string }} LogLine */

/** Substring (case-insensitive) or `/regex/` → predicate over line text. */
function compileFilter(filter) {
    if (!filter) return () => true;
    const text = String(filter).slice(0, MAX_FILTER_LENGTH);
    const regexForm = /^\/(.+)\/$/.exec(text);
    if (!regexForm) {
        const needle = text.toLowerCase();
        return (line) => line.text.toLowerCase().includes(needle);
    }
    let pattern;
    try {
        pattern = new RegExp(regexForm[1], 'i');
    } catch (err) {
        throw new Error(`Invalid search pattern: ${err.message}`);
    }
    return (line) => pattern.test(line.text);
}

/** @param {{ maxLines?: number, now?: () => number }} [options] */
function createLogBuffer({ maxLines = DEFAULT_MAX_LINES, now = Date.now } = {}) {
    // Private, append-only storage: copying the whole buffer for every line (as an immutable update
    // would) cost ~1M element copies/s for a process printing 500 lines/s (measured in M3). Lines are
    // appended and the oldest dropped in amortized chunks; readers only ever get copies.
    /** @type {LogLine[]} */
    let buffer = [];
    let seq = 0;
    const partials = { stdout: '', stderr: '' };
    const trimAt = maxLines + Math.max(1, Math.floor(maxLines / 2));
    const window = () => (buffer.length > maxLines ? buffer.slice(-maxLines) : buffer);

    /** @param {string} text @param {LogStream} stream */
    function push(text, stream) {
        seq += 1;
        const line = Object.freeze({ seq, ts: now(), stream, text });
        buffer.push(line);
        if (buffer.length >= trimAt) buffer = buffer.slice(-maxLines);
        return line;
    }

    /** @param {Buffer|string} chunk @param {'stdout'|'stderr'} stream @returns {LogLine[]} complete lines */
    function write(chunk, stream) {
        const parts = (partials[stream] + chunk.toString()).split(/\r?\n/);
        partials[stream] = parts.pop() ?? '';
        return parts.map((text) => push(text, stream));
    }

    /** Emits any unterminated trailing output (called when the process exits). */
    function flush() {
        return /** @type {Array<'stdout'|'stderr'>} */ (['stdout', 'stderr'])
            .filter((stream) => partials[stream])
            .map((stream) => {
                const line = push(partials[stream], stream);
                partials[stream] = '';
                return line;
            });
    }

    /** @param {{ filter?: string, limit?: number }} [options] */
    function query({ filter = '', limit = DEFAULT_QUERY_LIMIT } = {}) {
        const lines = window();
        if (!filter) return { lines: lines.slice(-limit), total: lines.length };
        const matches = lines.filter(compileFilter(filter));
        return { lines: matches.slice(-limit), total: matches.length };
    }

    return {
        write,
        flush,
        append: (text) => push(text, 'system'),
        lines: () => [...window()],
        count: () => Math.min(buffer.length, maxLines),
        query,
    };
}

module.exports = { createLogBuffer, compileFilter, DEFAULT_MAX_LINES };
