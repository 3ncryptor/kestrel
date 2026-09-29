// The hero grid: "KESTREL" set in meter cells above Kestrel's CPU history graph, drawn in the same cells. Colours
// follow the product: the word by each cell's position across the grid (like a meter filling), the graph by each
// row's height (green at the bottom, red at the top, like its braille graph). Pure, so it's unit-tested and the
// server and client render the same first frame.

/** A 5×7 pixel font for the letters of the name, top row first. */
const GLYPHS: Record<string, readonly string[]> = {
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
};
const GLYPH_W = 5;
const GLYPH_H = 7;
const LETTER_GAP = 1;
const LINE_GAP = 1;
const MARGIN = 1;

/** Kestrel's meter bands (ui/logic/charts.js GRADIENT_BANDS): the lowest percentage each level starts at. */
export const GRADIENT_BANDS = [
    [75, 'max'],
    [50, 'high'],
    [25, 'mid'],
    [0, 'low'],
] as const;
export type Level = (typeof GRADIENT_BANDS)[number][1];

export function gradientLevel(pct: number): Level {
    return (GRADIENT_BANDS.find(([floor]) => pct >= floor) ?? GRADIENT_BANDS[3])[1];
}

/** A graph row's colour, top row 0 (ui/components/box.jsx graphRows): green at the bottom, red at the top. */
export function graphRowLevel(row: number, height: number): Level {
    return gradientLevel(((height - 1 - row) / height) * 100);
}

export interface Cell {
    col: number;
    row: number;
    level: Level;
}

export interface HeroGrid {
    cols: number;
    rows: number;
    /** The letters' cells. Every other cell outside the graph is empty track. */
    word: Cell[];
    /** Where the graph is drawn: its first row, its height in rows, and its columns. */
    graph: { top: number; height: number; left: number; width: number };
}

function glyphsOf(line: string) {
    return [...line].map((ch) => {
        const glyph = GLYPHS[ch];
        if (!glyph) throw new Error(`wordmark: no glyph for "${ch}"`);
        return glyph;
    });
}

const lineWidth = (letters: number) => letters * GLYPH_W + (letters - 1) * LETTER_GAP;

/** The grid for `lines` of the name (one line on wide screens, two on phones) above a graph `graphHeight` rows tall. */
export function heroGrid(lines: readonly string[], graphHeight: number): HeroGrid {
    const widest = Math.max(...lines.map((l) => l.length));
    const cols = MARGIN * 2 + lineWidth(widest);
    const wordRows = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP;
    const graphTop = MARGIN + wordRows + LINE_GAP;
    const rows = graphTop + graphHeight + MARGIN;
    const word: Cell[] = [];
    lines.forEach((line, n) => {
        const top = MARGIN + n * (GLYPH_H + LINE_GAP);
        glyphsOf(line).forEach((glyph, i) => {
            const left = MARGIN + i * (GLYPH_W + LETTER_GAP);
            glyph.forEach((bits, y) => {
                [...bits].forEach((bit, x) => {
                    if (bit !== '#') return;
                    const col = left + x;
                    word.push({ col, row: top + y, level: gradientLevel((col / cols) * 100) });
                });
            });
        });
    });
    return { cols, rows, word, graph: { top: graphTop, height: graphHeight, left: MARGIN, width: cols - MARGIN * 2 } };
}

/** How many of a column's `height` cells a CPU percentage fills (at least one, as Kestrel's graph never drops to nothing). */
export function filledRows(pct: number, height: number): number {
    return Math.max(1, Math.min(height, Math.round((pct / 100) * height)));
}

/** A small deterministic generator, so the first frame is the same on every build, server and client. */
export function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

const CPU_MIN = 4;
const CPU_MAX = 88;
/** Where the walk settles: a machine that is mostly idle, with bursts. */
const CPU_MEAN = 28;
const CPU_PULL = 0.2;
const CPU_STEP = 18;

/**
 * The next CPU sample: a random walk that is pulled back toward a mostly idle mean, so the graph moves like a real
 * machine (bursts that settle) rather than noise or a slow climb to 100%.
 */
export function nextSample(previous: number, random: () => number): number {
    const next = previous + (CPU_MEAN - previous) * CPU_PULL + (random() - 0.5) * CPU_STEP * 2;
    return Math.round(Math.min(CPU_MAX, Math.max(CPU_MIN, next)));
}

/** `length` samples of the walk from a fixed seed: the graph's first frame. */
export function initialSeries(length: number, seed = 0x6b657374): number[] {
    const random = seeded(seed);
    const series: number[] = [];
    let value = 30;
    for (let i = 0; i < length; i++) {
        value = nextSample(value, random);
        series.push(value);
    }
    return series;
}
