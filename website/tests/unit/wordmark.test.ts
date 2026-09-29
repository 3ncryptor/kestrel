import { describe, expect, test } from 'vitest';
import { filledRows, GRADIENT_BANDS, gradientLevel, graphRowLevel, heroGrid, initialSeries, nextSample, seeded } from '@/lib/wordmark';
// The product's own meter code: the hero must colour cells exactly as Kestrel does.
// @ts-expect-error the product is plain JavaScript without type declarations; this test checks its behaviour
import { gradientLevel as productLevel } from '../../../ui/logic/charts.js';

describe('colours', () => {
    test('the word uses the same bands as Kestrel’s meters', () => {
        for (let pct = 0; pct <= 100; pct++) expect(gradientLevel(pct), `${pct}%`).toBe(productLevel(pct));
        expect(GRADIENT_BANDS.map(([floor]) => floor)).toEqual([75, 50, 25, 0]);
    });

    test('the graph is coloured by height like Kestrel’s (box.jsx graphRows): green at the bottom, red at the top', () => {
        const height = 7;
        for (let row = 0; row < height; row++) expect(graphRowLevel(row, height)).toBe(productLevel(((height - 1 - row) / height) * 100));
        expect(graphRowLevel(height - 1, height)).toBe('low');
        expect(graphRowLevel(0, height)).toBe('max');
    });
});

describe('heroGrid', () => {
    test('wide: KESTREL on one line above a 7-row graph is 43×17, about AlgoLedger’s proportions', () => {
        const grid = heroGrid(['KESTREL'], 7);
        expect([grid.cols, grid.rows]).toEqual([43, 17]);
        expect(grid.graph).toEqual({ top: 9, height: 7, left: 1, width: 41 });
    });

    test('narrow: KES / TREL on two lines is 25 columns wide', () => {
        const grid = heroGrid(['KES', 'TREL'], 6);
        expect([grid.cols, grid.rows]).toEqual([25, 24]);
        expect(grid.graph.top).toBe(17);
    });

    test('lights exactly the letters’ pixels, green on the left and red on the right, like a full meter', () => {
        const { word } = heroGrid(['KESTREL'], 7);
        // K 14 + E 18 + S 15 + T 11 + R 18 + E 18 + L 11
        expect(word).toHaveLength(105);
        expect(word.find((c) => c.col === 1 && c.row === 1)?.level).toBe('low');
        expect(word.find((c) => c.col === 41 && c.row === 7)?.level).toBe('max');
        expect(word.every((c) => c.row >= 1 && c.row <= 7)).toBe(true);
    });

    test('refuses a letter it has no glyph for', () => {
        expect(() => heroGrid(['KESTREL!'], 7)).toThrow(/no glyph for "!"/);
    });
});

describe('the CPU series', () => {
    test('is the same on every build, so server and client render the same first frame', () => {
        expect(initialSeries(41)).toEqual(initialSeries(41));
        expect(initialSeries(41)).toHaveLength(41);
    });

    test('walks within 4–88%, in steps a real machine could take, and settles around a mostly idle mean', () => {
        const random = seeded(42);
        let value = 50;
        let total = 0;
        const samples = 5000;
        for (let i = 0; i < samples; i++) {
            const next = nextSample(value, random);
            expect(next).toBeGreaterThanOrEqual(4);
            expect(next).toBeLessThanOrEqual(88);
            expect(Math.abs(next - value)).toBeLessThanOrEqual(30);
            total += next;
            value = next;
        }
        const mean = total / samples;
        expect(mean).toBeGreaterThan(18);
        expect(mean).toBeLessThan(40);
    });

    test('a column always fills at least one cell and never more than the graph', () => {
        expect(filledRows(0, 7)).toBe(1);
        expect(filledRows(50, 7)).toBe(4);
        expect(filledRows(100, 7)).toBe(7);
    });
});
