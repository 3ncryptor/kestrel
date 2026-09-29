// Logs panel logic (UI_SPEC §6.7): which lines are on screen, and which parts of them match the search.
// Following shows the newest lines. Paused, the view is anchored at the newest line of the moment it
// paused (by timestamp), so it stays still while new lines arrive, and those are counted. Pure.

// Matches the in-memory buffer size (core/processManager/logBuffer.js), so a paused view can reach
// every line still held.
export const LOG_LIMIT = 2000;
const MAX_FILTER_LENGTH = 200;

/** Newest-last merge of several processes' lines (ties keep the given process order). */
function interleave(results) {
    const tagged = results.flatMap((r, order) => r.lines.map((l) => ({ ...l, id: r.id, order })));
    return tagged.sort((a, b) => a.ts - b.ts || a.order - b.order || a.seq - b.seq);
}

/**
 * @param {{ getLogs: (id: string, o: { filter: string, limit: number }) => { ok: boolean, data?: any, error?: string },
 *           ids: string[], filter: string, follow: boolean, anchorTs?: number|null, offset?: number, rows: number }} input
 * @returns {{ lines: any[], total: number, newCount: number, maxOffset: number, newestTs: number|null, error: string|null }}
 */
export function logView({ getLogs, ids, filter, follow, anchorTs = null, offset = 0, rows }) {
    const limit = follow ? rows : LOG_LIMIT;
    let error = null;
    const results = ids.map((id) => {
        const res = getLogs(id, { filter, limit });
        if (res.ok) return { id, ...res.data };
        error = res.error;
        return { id, lines: [], total: 0 };
    });
    const merged = interleave(results);
    const total = results.reduce((n, r) => n + r.total, 0);
    const newestTs = merged.length ? merged[merged.length - 1].ts : null;
    if (follow || anchorTs === null) {
        return { lines: merged.slice(-rows), total, newCount: 0, maxOffset: Math.max(0, merged.length - rows), newestTs, error };
    }
    const anchored = merged.filter((l) => l.ts <= anchorTs);
    const maxOffset = Math.max(0, anchored.length - rows);
    const end = anchored.length - Math.min(offset, maxOffset);
    return {
        lines: anchored.slice(Math.max(0, end - rows), end),
        total,
        newCount: merged.length - anchored.length,
        maxOffset,
        newestTs,
        error,
    };
}

// CSI/OSC escape sequences and other C0/C1 control characters. Children often print colors (npm, vite);
// a hostile one could try to drive the terminal. Only plain text reaches the screen.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
const TAB_WIDTH = 4;

/** A log line as plain, single-line text. Saved log files keep the original bytes. */
export function sanitizeLine(text) {
    return text.replace(ESCAPES, '').replace(/\t/g, ' '.repeat(TAB_WIDTH)).replace(CONTROLS, '');
}

function matcher(filter) {
    const text = String(filter || '').slice(0, MAX_FILTER_LENGTH);
    if (!text) return null;
    const regexForm = /^\/(.+)\/$/.exec(text);
    try {
        return regexForm ? new RegExp(regexForm[1], 'gi') : new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    } catch {
        return null; // the core reports the invalid pattern; here it just highlights nothing
    }
}

/** Splits `text` into matching and non-matching parts for the search highlight. */
export function highlightParts(text, filter) {
    const pattern = matcher(filter);
    if (!pattern) return [{ text, match: false }];
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
        if (!m[0]) continue; // zero-length matches highlight nothing
        if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
        parts.push({ text: m[0], match: true });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), match: false });
    return parts.length ? parts : [{ text, match: false }];
}
