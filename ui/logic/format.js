// Display formatting (UI_SPEC §9). Pure.

const DASH = '—';
const ELLIPSIS = '…';
const MB_PER_GB = 1024;
const COUNT_SEPARATOR_ABOVE = 9999;
const UNITS = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
];

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export const formatCpu = (v) => (isNumber(v) ? v.toFixed(1) : DASH);

export const formatPercent = (v) => (isNumber(v) ? `${Math.round(v)}%` : DASH);

export function formatMem(mb) {
    if (!isNumber(mb)) return DASH;
    return mb < MB_PER_GB ? `${Math.round(mb)} MB` : `${(mb / MB_PER_GB).toFixed(1)} GB`;
}

export function formatCount(n) {
    return n > COUNT_SEPARATOR_ABOVE ? n.toLocaleString('en-US') : String(n);
}

/** The two largest non-zero units: 45s · 12m 3s · 3h 4m · 3d 4h. */
export function formatDuration(totalSec) {
    let rest = Math.max(0, Math.floor(totalSec || 0));
    const parts = [];
    for (const [unit, size] of UNITS) {
        const value = Math.floor(rest / size);
        rest -= value * size;
        if (value > 0 || parts.length) parts.push(`${value}${unit}`);
        if (parts.length === 2) break;
    }
    if (!parts.length) return '0s';
    return parts.length === 2 && parts[1].startsWith('0') ? parts[0] : parts.join(' ');
}

export function formatClock(ts) {
    const d = new Date(ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function truncateEnd(text, width) {
    const s = String(text ?? '');
    if (width <= 0) return '';
    return s.length <= width ? s : `${s.slice(0, width - 1)}${ELLIPSIS}`;
}

/** Paths: keep the leading segments and the last part, cut the middle (`~/code/…/server`). */
export function truncateMiddle(path, width) {
    const s = String(path ?? '');
    if (s.length <= width) return s;
    const parts = s.split('/');
    const last = parts[parts.length - 1];
    let head = parts[0];
    if (`${head}/${ELLIPSIS}/${last}`.length > width) return truncateEnd(s, width);
    for (const part of parts.slice(1, -1)) {
        const next = `${head}/${part}`;
        if (`${next}/${ELLIPSIS}/${last}`.length > width) break;
        head = next;
    }
    return `${head}/${ELLIPSIS}/${last}`;
}

export const padStart = (value, width) => truncateEnd(String(value), width).padStart(width);
export const padEnd = (value, width) => truncateEnd(String(value), width).padEnd(width);
