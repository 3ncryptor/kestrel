// The website's hero frames (scripts/website/frames.js): OpenTUI captures → a compact, delta-encoded
// format the site replays. Round trips must be exact, so the site shows what Kestrel drew.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { colorHex, normalizeFrame, encodeFrames, decodeFrames, gzipSize } = require('../../scripts/website/frames');

const DEFAULT = 2; // OpenTUI RGBA intent: the terminal's own colour
const rgba = (r, g, b, a = 255, intent = 0) => ({ intent, toInts: () => [r, g, b, a] });
const span = (text, fg, bg, attributes = 0, width = [...text].length) => ({ text, fg, bg, attributes, width });

const RED = '#f38ba8';
const BLACK = '#000000';
const line = (...spans) => spans;
const frame = (...lines) => ({ cols: 4, rows: lines.length, lines });

test('colorHex turns RGBA into #rrggbb, and the terminal default or a transparent colour into null', () => {
    assert.equal(colorHex(rgba(243, 139, 168)), RED);
    assert.equal(colorHex(rgba(0, 0, 0)), BLACK);
    assert.equal(colorHex(rgba(1, 2, 3, 255, DEFAULT)), null);
    assert.equal(colorHex(rgba(1, 2, 3, 0)), null);
    assert.equal(colorHex(null), null);
});

test('normalizeFrame keeps text, colours, attributes and cell widths of every span', () => {
    const captured = { cols: 4, rows: 1, cursor: [0, 0], lines: [{ spans: [span('ab', rgba(243, 139, 168), rgba(0, 0, 0), 1), span('⣿', null, null, 0, 1)] }] };
    assert.deepEqual(normalizeFrame(captured), {
        cols: 4,
        rows: 1,
        lines: [[{ text: 'ab', fg: RED, bg: BLACK, attrs: 1, width: 2 }, { text: '⣿', fg: null, bg: null, attrs: 0, width: 1 }]],
    });
});

test('encodeFrames stores each colour once and refers to it by index', () => {
    const f = frame(line({ text: 'ab', fg: RED, bg: BLACK, attrs: 0, width: 2 }), line({ text: 'cd', fg: RED, bg: null, attrs: 1, width: 2 }));
    const encoded = encodeFrames([f]);
    assert.deepEqual(encoded.palette, [RED, BLACK]);
    assert.deepEqual(encoded.frames[0].lines, { 0: [['ab', 0, 1, 0]], 1: [['cd', 0, null, 1]] });
    assert.deepEqual([encoded.version, encoded.cols, encoded.rows], [1, 4, 2]);
});

test('later frames carry only the lines that changed', () => {
    const a = { text: 'aaaa', fg: RED, bg: null, attrs: 0, width: 4 };
    const b = { text: 'bbbb', fg: RED, bg: null, attrs: 0, width: 4 };
    const encoded = encodeFrames([frame(line(a), line(a)), frame(line(a), line(b)), frame(line(a), line(b))]);
    assert.deepEqual(Object.keys(encoded.frames[0].lines), ['0', '1']);
    assert.deepEqual(encoded.frames[1].lines, { 1: [['bbbb', 0, null, 0]] });
    assert.deepEqual(encoded.frames[2].lines, {}, 'an unchanged frame is empty');
});

test('a span width is stored only when it differs from its character count', () => {
    const wide = { text: '界', fg: null, bg: null, attrs: 0, width: 2 };
    const narrow = { text: 'x', fg: null, bg: null, attrs: 0, width: 1 };
    assert.deepEqual(encodeFrames([frame(line(wide, narrow))]).frames[0].lines[0], [['界', null, null, 0, 2], ['x', null, null, 0]]);
});

test('decodeFrames restores every frame exactly', () => {
    const s = (text, fg, bg, attrs = 0, width = [...text].length) => ({ text, fg, bg, attrs, width });
    const frames = [
        frame(line(s('ab', RED, BLACK), s('cd', null, BLACK, 1)), line(s('⣀⣤', '#89b4fa', null))),
        frame(line(s('ab', RED, BLACK), s('cd', null, BLACK, 1)), line(s('⣤⣶', '#89b4fa', null))),
        frame(line(s('界', RED, null, 0, 2), s('!', null, null)), line(s('⣤⣶', '#89b4fa', null))),
    ];
    assert.deepEqual(decodeFrames(encodeFrames(frames)), frames);
});

test('encodeFrames refuses frames of different sizes', () => {
    const a = { text: 'a', fg: null, bg: null, attrs: 0, width: 1 };
    assert.throws(() => encodeFrames([frame(line(a)), { cols: 5, rows: 1, lines: [line(a)] }]), /frame 1 is 5x1, expected 4x1/);
});

test('gzipSize measures the encoded JSON as it will be served', () => {
    const size = gzipSize({ a: 'x'.repeat(10_000) });
    assert.ok(size > 0 && size < 200, `${size} bytes`);
});
