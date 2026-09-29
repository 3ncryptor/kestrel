import { describe, expect, test } from 'vitest';
import { GRADIENT_BANDS, gradientLevel, wordmark } from '@/lib/wordmark';
// The product's own meter code: the wordmark must colour cells exactly as Kestrel does.
// @ts-expect-error the product is plain JavaScript without type declarations; this test checks its behaviour
import { gradientLevel as productLevel } from '../../../ui/logic/charts.js';

describe('the wordmark', () => {
    test('colours cells with the same bands as Kestrel’s meters', () => {
        for (let pct = 0; pct <= 100; pct++) expect(gradientLevel(pct), `${pct}%`).toBe(productLevel(pct));
        expect(GRADIENT_BANDS.map(([floor]) => floor)).toEqual([75, 50, 25, 0]);
    });

    test('is a 43×9 grid: seven 5×7 letters, one-cell gaps, a one-cell margin', () => {
        const { cols, rows, cells } = wordmark();
        expect([cols, rows]).toEqual([43, 9]);
        expect(cells).toHaveLength(43 * 9);
    });

    test('lights exactly the letters’ pixels, green on the left and red on the right, like a full meter', () => {
        const { cells } = wordmark();
        const lit = cells.filter((c) => c.level !== null);
        // K 14 + E 18 + S 15 + T 11 + R 18 + E 18 + L 11
        expect(lit).toHaveLength(105);
        expect(lit.find((c) => c.col === 1 && c.row === 1)?.level).toBe('low');
        expect(lit.find((c) => c.col === 41 && c.row === 7)?.level).toBe('max');
        expect(cells.every((c) => (c.row > 0 && c.row < 8) || c.level === null)).toBe(true);
    });

    test('flickers the same empty cells on every build (server and client agree)', () => {
        expect(wordmark()).toEqual(wordmark());
        const flickering = wordmark().cells.filter((c) => c.flicker !== undefined);
        expect(flickering.length).toBeGreaterThan(0);
        expect(flickering.every((c) => c.level === null)).toBe(true);
    });

    test('refuses a letter it has no glyph for', () => {
        expect(() => wordmark('KESTREL!')).toThrow(/no glyph for "!"/);
    });
});
