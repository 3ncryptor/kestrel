import { describe, expect, test } from 'vitest';
import { type Day, levelFor, monthLabels, summarize, weeksOf } from '@/lib/heatmap';

/** `n` consecutive days from `start` (UTC), with counts from `count(i)`. */
function days(start: string, n: number, count: (i: number) => number = () => 0): Day[] {
    const t0 = Date.parse(`${start}T00:00:00Z`);
    return Array.from({ length: n }, (_, i) => ({ date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), count: count(i) }));
}

describe('levelFor', () => {
    test('no commits is level 0, and the busiest day is level 4', () => {
        expect(levelFor(0, 10)).toBe(0);
        expect(levelFor(10, 10)).toBe(4);
    });

    test('any commit is at least level 1, and levels step in quarters of the busiest day', () => {
        expect(levelFor(1, 100)).toBe(1);
        expect(levelFor(26, 100)).toBe(2);
        expect(levelFor(51, 100)).toBe(3);
        expect(levelFor(76, 100)).toBe(4);
    });

    test('an empty range has no levels (no division by zero)', () => {
        expect(levelFor(0, 0)).toBe(0);
    });
});

describe('weeksOf', () => {
    test('never invents days: no data is no weeks', () => {
        expect(weeksOf([])).toEqual([]);
    });

    test('groups into Sunday-first weeks and pads the edges with empty cells, not zero-commit days', () => {
        // 2026-09-02 is a Wednesday.
        const weeks = weeksOf(days('2026-09-02', 10, (i) => i + 1));
        expect(weeks).toHaveLength(2);
        expect(weeks[0]?.slice(0, 3)).toEqual([undefined, undefined, undefined]);
        expect(weeks[0]?.[3]).toEqual({ date: '2026-09-02', count: 1 });
        expect(weeks[1]?.[5]).toEqual({ date: '2026-09-11', count: 10 });
        expect(weeks[1]?.[6]).toBeUndefined();
        const real = weeks.flat().filter((d) => d !== undefined);
        expect(real).toHaveLength(10);
    });

    test('sorts its input, so the order the API returns days in does not matter', () => {
        const input = days('2026-09-06', 7);
        expect(weeksOf([...input].reverse())).toEqual(weeksOf(input));
    });
});

describe('monthLabels', () => {
    test('labels each month at its first week, dropping one with no room at the edge', () => {
        // 16 weeks from Sunday 2026-06-07: June … September.
        const labels = monthLabels(weeksOf(days('2026-06-07', 16 * 7)));
        expect(labels.map((l) => l.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep']);
        expect(labels[0]?.week).toBe(0);
    });
});

describe('summarize', () => {
    test('states the total, the active days and the busiest day', () => {
        const input = days('2026-09-01', 5, (i) => [0, 3, 0, 7, 1][i] ?? 0);
        expect(summarize(input)).toEqual({ total: 11, activeDays: 3, busiest: { date: '2026-09-04', count: 7 } });
    });

    test('a quiet range has no busiest day', () => {
        expect(summarize(days('2026-09-01', 3)).busiest).toBeUndefined();
    });
});
