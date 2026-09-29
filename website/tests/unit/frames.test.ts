import { describe, expect, test } from 'vitest';
import compact from '@/generated/hero-compact.json';
import mono from '@/generated/hero-mono.json';
import standard from '@/generated/hero-standard.json';
import { ATTR, decodeAll, type EncodedFrames, frameText, spanStyle } from '@/lib/frames';

/** arr[i], failing the test (not returning undefined) when it is missing. */
function at<T>(arr: readonly T[] | undefined, i: number): T {
    const value = arr?.[i];
    if (value === undefined) throw new Error(`no element ${i}`);
    return value;
}

const tiny: EncodedFrames = {
    version: 1,
    cols: 3,
    rows: 2,
    palette: ['#f38ba8', '#000000'],
    frames: [
        { lines: { 0: [['ab', 0, 1, 0], ['c', null, null, 1]], 1: [['界', 0, null, 0, 2], ['x', null, null, 0]] } },
        { lines: { 1: [['xyz', 0, null, 0]] } },
    ],
};

describe('decoding hero frames', () => {
    test('frame 0 has every line and later frames change only the lines they carry', () => {
        const frames = decodeAll(tiny);
        const [first, second] = [at(frames, 0), at(frames, 1)];
        expect(frameText(first)).toEqual(['abc', '界x']);
        expect(frameText(second)).toEqual(['abc', 'xyz']);
        expect(second.lines[0]).toBe(first.lines[0]);
    });

    test('colours come from the palette, null means the terminal default, widths default to the length', () => {
        const first = at(decodeAll(tiny), 0);
        expect(at(at(first.lines, 0), 0)).toEqual({ text: 'ab', fg: '#f38ba8', bg: '#000000', attrs: 0, width: 2 });
        expect(at(at(first.lines, 0), 1)).toEqual({ text: 'c', fg: null, bg: null, attrs: 1, width: 1 });
        expect(at(at(first.lines, 1), 0).width).toBe(2);
    });

    test.each([
        ['standard', standard, 100, 30, 30],
        ['compact', compact, 64, 26, 1],
        ['mono', mono, 100, 30, 1],
    ] as const)('the generated %s hero decodes to full rows of exactly its width', (_, data, cols, rows, count) => {
        const frames = decodeAll(data as unknown as EncodedFrames);
        expect(frames).toHaveLength(count);
        for (const frame of frames) {
            expect(frame.lines).toHaveLength(rows);
            for (const line of frame.lines) expect(line.reduce((n, s) => n + s.width, 0)).toBe(cols);
        }
    });

    test('the standard hero tells the crash-and-restart story', () => {
        const text = decodeAll(standard as unknown as EncodedFrames).map((f) => frameText(f).join('\n'));
        expect(text[0]).toMatch(/● worker ready/);
        expect(text[13]).toMatch(/↻ worker retry 1 in \ds/);
        expect(text[13]).toMatch(/\[kestrel\] crashed \(code 1, signal null\)/);
        expect(text[19]).toMatch(/● worker ready/);
    });
});

describe('span styles', () => {
    test('colours map to CSS; the terminal default leaves them to the page', () => {
        expect(spanStyle({ text: 'a', fg: '#89b4fa', bg: '#000000', attrs: 0, width: 1 })).toEqual({ color: '#89b4fa', backgroundColor: '#000000', width: '1ch' });
        expect(spanStyle({ text: 'ab', fg: null, bg: null, attrs: 0, width: 2 })).toEqual({ width: '2ch' });
    });

    test('attributes become weight, faintness, italics and lines', () => {
        const style = spanStyle({ text: 'a', fg: '#ffffff', bg: null, attrs: ATTR.BOLD | ATTR.DIM | ATTR.ITALIC | ATTR.UNDERLINE | ATTR.STRIKETHROUGH, width: 1 });
        expect(style).toMatchObject({ fontWeight: 700, opacity: 0.55, fontStyle: 'italic', textDecorationLine: 'underline line-through' });
    });

    test('inverse swaps the colours, using the page defaults for a missing one', () => {
        expect(spanStyle({ text: 'a', fg: '#cdd6f4', bg: null, attrs: ATTR.INVERSE, width: 1 })).toMatchObject({ color: 'var(--k-base)', backgroundColor: '#cdd6f4' });
    });

    test('hidden text keeps its width but is not drawn', () => {
        expect(spanStyle({ text: 'a', fg: null, bg: null, attrs: ATTR.HIDDEN, width: 1 })).toMatchObject({ visibility: 'hidden', width: '1ch' });
    });
});
