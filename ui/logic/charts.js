// Text charts: braille graphs and gradient meters, btop-style (UI_SPEC §3.2, §4.1). Pure.

const GRADIENT_BANDS = [[75, 'max'], [50, 'high'], [25, 'mid'], [0, 'low']];

/** 0–100 → the gradient band a value belongs to. */
export function gradientLevel(pct) {
    return GRADIENT_BANDS.find(([floor]) => pct >= floor)[1];
}

const DOTS_PER_ROW = 4;
// Braille dots for one column, bottom to top (U+2800 block), as masks for "the lowest n dots": the
// graph redraws every tick, and building each mask per cell (slice + reduce) was its main cost.
const LEFT_BITS = [0x40, 0x04, 0x02, 0x01];
const RIGHT_BITS = [0x80, 0x20, 0x10, 0x08];
const lowestDots = (bits) => [0, 1, 2, 3, 4].map((n) => bits.slice(0, n).reduce((a, b) => a | b, 0));
const LEFT_MASKS = lowestDots(LEFT_BITS);
const RIGHT_MASKS = lowestDots(RIGHT_BITS);
const BRAILLE_BASE = 0x2800;

const clampPct = (v) => Math.min(100, Math.max(0, v || 0));

/**
 * A multi-row braille area graph: each character holds two samples (left/right dot columns) with four
 * levels per row, filled from the bottom. Returns `height` strings, top row first.
 */
export function brailleGraph(values, width, height) {
    const count = width * 2;
    const offset = count - Math.min(count, values.length); // missing history reads as 0 on the left
    const start = values.length - (count - offset);
    const levels = new Array(count);
    for (let i = 0; i < count; i++) {
        levels[i] = i < offset ? 0 : Math.round((clampPct(values[start + i - offset]) / 100) * height * DOTS_PER_ROW);
    }
    const rows = [];
    const codes = new Array(width);
    for (let r = 0; r < height; r++) {
        const below = (height - 1 - r) * DOTS_PER_ROW;
        for (let c = 0; c < width; c++) {
            const left = Math.min(DOTS_PER_ROW, Math.max(0, levels[c * 2] - below));
            const right = Math.min(DOTS_PER_ROW, Math.max(0, levels[c * 2 + 1] - below));
            codes[c] = BRAILLE_BASE + (LEFT_MASKS[left] | RIGHT_MASKS[right]);
        }
        rows.push(String.fromCharCode(...codes));
    }
    return rows;
}

const BLOCK_LEVELS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** No-color fallback: one sample per column, eight block levels per row. */
export function blockGraph(values, width, height) {
    const samples = values.slice(-width);
    const padded = [...new Array(width - samples.length).fill(0), ...samples];
    const levels = padded.map((v) => Math.round((clampPct(v) / 100) * height * 8));
    const rows = [];
    for (let r = 0; r < height; r++) {
        const below = (height - 1 - r) * 8;
        rows.push(levels.map((level) => BLOCK_LEVELS[Math.min(8, Math.max(0, level - below))]).join(''));
    }
    return rows;
}

const FILLED = '■';
const UNFILLED = '─';

/**
 * A meter as { level, text } segments: each filled cell takes the gradient band of its own position
 * (so a full meter shows every color), unfilled cells are 'empty'. Adjacent cells are merged.
 */
export function meterSegments(value, width, max = 100) {
    const filled = Math.round((Math.min(max, Math.max(0, value || 0)) / max) * width);
    const segments = [];
    const push = (level, char) => {
        const last = segments[segments.length - 1];
        if (last && last.level === level) last.text += char;
        else segments.push({ level, text: char });
    };
    for (let i = 0; i < width; i++) {
        if (i < filled) push(gradientLevel((i / width) * 100), FILLED);
        else push('empty', UNFILLED);
    }
    return segments;
}
