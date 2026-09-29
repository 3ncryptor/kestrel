// The website's hero frames: OpenTUI captures (CapturedFrame from captureSpans()) → a compact format
// the site replays (website/src/lib/frames.ts decodes it).
//
//   { version: 1, cols, rows, palette: ['#rrggbb', …],
//     frames: [{ lines: { <row>: [[text, fg, bg, attrs, width?], …] } }, …] }
//
// fg/bg index `palette`, or are null for the terminal's default colour. attrs is OpenTUI's TextAttributes
// bitmask. width (in cells) is only stored when it differs from the text's character count. Frame 0 has
// every line; each later frame has only the lines that changed.
const zlib = require('node:zlib');

const FORMAT_VERSION = 1;
const RGBA_INTENT_DEFAULT = 2; // OpenTUI: "use the terminal's own colour"

const hex2 = (n) => n.toString(16).padStart(2, '0');

/** OpenTUI RGBA → '#rrggbb', or null for the terminal default / a transparent colour. */
function colorHex(rgba) {
    if (!rgba || rgba.intent === RGBA_INTENT_DEFAULT) return null;
    const [r, g, b, a] = rgba.toInts();
    if (a === 0) return null;
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** A CapturedFrame as plain data: lines of { text, fg, bg, attrs, width }. */
function normalizeFrame(captured) {
    return {
        cols: captured.cols,
        rows: captured.rows,
        lines: captured.lines.map((line) => line.spans.map((s) => ({
            text: s.text, fg: colorHex(s.fg), bg: colorHex(s.bg), attrs: s.attributes & 0xff, width: s.width,
        }))),
    };
}

/** @param {Array<{ cols: number, rows: number, lines: any[][] }>} frames normalized frames */
function encodeFrames(frames) {
    if (!frames.length) throw new Error('no frames to encode');
    const { cols, rows } = frames[0];
    const palette = [];
    const indexOf = new Map();
    const colour = (hex) => {
        if (hex === null) return null;
        if (!indexOf.has(hex)) {
            indexOf.set(hex, palette.length);
            palette.push(hex);
        }
        return indexOf.get(hex);
    };
    const encodeSpan = (s) => {
        const out = [s.text, colour(s.fg), colour(s.bg), s.attrs];
        if (s.width !== [...s.text].length) out.push(s.width);
        return out;
    };
    let previous = [];
    const encoded = frames.map((frame, n) => {
        if (frame.cols !== cols || frame.rows !== rows) {
            throw new Error(`frame ${n} is ${frame.cols}x${frame.rows}, expected ${cols}x${rows}`);
        }
        const lines = {};
        const keys = frame.lines.map((line, row) => {
            const spans = line.map(encodeSpan);
            const key = JSON.stringify(spans);
            if (key !== previous[row]) lines[row] = spans;
            return key;
        });
        previous = keys;
        return { lines };
    });
    return { version: FORMAT_VERSION, cols, rows, palette, frames: encoded };
}

/** The inverse of encodeFrames: every frame in full, as normalized frames. */
function decodeFrames({ cols, rows, palette, frames }) {
    const colour = (i) => (i === null ? null : palette[i]);
    let current = [];
    return frames.map(({ lines }) => {
        current = current.slice();
        for (const [row, spans] of Object.entries(lines)) {
            current[Number(row)] = spans.map(([text, fg, bg, attrs, width]) => ({
                text, fg: colour(fg), bg: colour(bg), attrs, width: width ?? [...text].length,
            }));
        }
        return { cols, rows, lines: current };
    });
}

/** Bytes of `value` as JSON after gzip, as a CDN would serve it. */
function gzipSize(value) {
    return zlib.gzipSync(JSON.stringify(value), { level: 9 }).length;
}

module.exports = { FORMAT_VERSION, colorHex, normalizeFrame, encodeFrames, decodeFrames, gzipSize };
