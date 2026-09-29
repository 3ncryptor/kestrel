// The hero's wordmark: "KESTREL" set in a grid of meter cells, coloured the way Kestrel colours its own meters,
// by each cell's position across the grid. Pure, so it's unit-tested and renders identically on the server.

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

export interface Cell {
    col: number;
    row: number;
    /** Lit cells are the letters; the rest is the empty track of the meter. */
    level: Level | null;
    /** For a few empty cells: when (in seconds) they flicker, like background activity. */
    flicker?: number;
}

/** Share of empty cells that flicker now and then. */
const FLICKER_SHARE = 0.07;
const FLICKER_PERIOD_S = 6;

/** A small deterministic generator, so the flicker is the same on every build (and on server and client). */
function seeded(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

export function wordmark(word = 'KESTREL'): { cols: number; rows: number; cells: Cell[] } {
    const letters = [...word].map((ch) => {
        const glyph = GLYPHS[ch];
        if (!glyph) throw new Error(`wordmark: no glyph for "${ch}"`);
        return glyph;
    });
    const cols = MARGIN * 2 + letters.length * GLYPH_W + (letters.length - 1) * LETTER_GAP;
    const rows = MARGIN * 2 + GLYPH_H;
    const random = seeded(word.length * 7919);
    const cells: Cell[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col - MARGIN;
            const y = row - MARGIN;
            const letter = Math.floor(x / (GLYPH_W + LETTER_GAP));
            const within = x - letter * (GLYPH_W + LETTER_GAP);
            const lit = x >= 0 && y >= 0 && y < GLYPH_H && within < GLYPH_W && letters[letter]?.[y]?.[within] === '#';
            if (lit) cells.push({ col, row, level: gradientLevel((col / cols) * 100) });
            else if (random() < FLICKER_SHARE) cells.push({ col, row, level: null, flicker: Math.round(random() * FLICKER_PERIOD_S * 10) / 10 });
            else cells.push({ col, row, level: null });
        }
    }
    return { cols, rows, cells };
}
