import type { CSSProperties } from 'react';

// Hero frames: real Kestrel frames captured by scripts/website/generate.jsx (the format is documented in
// scripts/website/frames.js). Frame 0 has every line; later frames carry only the lines that changed.

/** [text, fg palette index | null, bg palette index | null, TextAttributes bitmask, width in cells?] */
export type EncodedSpan = [string, number | null, number | null, number, number?];

export interface EncodedFrames {
    version: 1;
    cols: number;
    rows: number;
    palette: string[];
    frames: Array<{ lines: Record<string, EncodedSpan[]> }>;
}

export interface Span {
    text: string;
    fg: string | null;
    bg: string | null;
    attrs: number;
    width: number;
}

export interface Frame {
    cols: number;
    rows: number;
    lines: Span[][];
}

/** OpenTUI's TextAttributes bits. */
export const ATTR = Object.freeze({ BOLD: 1, DIM: 2, ITALIC: 4, UNDERLINE: 8, BLINK: 16, INVERSE: 32, HIDDEN: 64, STRIKETHROUGH: 128 });

const DIM_OPACITY = 0.55;
/** What a terminal draws for "default" colours on this page. */
const DEFAULT_FG = 'var(--k-text)';
const DEFAULT_BG = 'var(--k-base)';

function decodeLine(spans: EncodedSpan[], palette: string[]): Span[] {
    const colour = (i: number | null) => (i === null ? null : (palette[i] ?? null));
    return spans.map(([text, fg, bg, attrs, width]) => ({ text, fg: colour(fg), bg: colour(bg), attrs, width: width ?? [...text].length }));
}

/** Every frame in full. Unchanged lines are shared between frames (same array), so React can skip them. */
export function decodeAll({ cols, rows, palette, frames }: EncodedFrames): Frame[] {
    let lines: Span[][] = [];
    return frames.map((frame) => {
        lines = lines.slice();
        for (const [row, spans] of Object.entries(frame.lines)) lines[Number(row)] = decodeLine(spans, palette);
        return { cols, rows, lines };
    });
}

/** Only the first frame (for the server-rendered hero). */
export function decodeFirst(data: EncodedFrames): Frame {
    return decodeAll({ ...data, frames: data.frames.slice(0, 1) })[0] as Frame;
}

export function frameText(frame: Frame): string[] {
    return frame.lines.map((line) => line.map((s) => s.text).join(''));
}

/** A span as CSS: colours, attributes, and an exact width in cells so glyph widths can't shift columns. */
export function spanStyle({ fg, bg, attrs, width }: Span): CSSProperties {
    const style: CSSProperties = { width: `${width}ch` };
    let color = fg;
    let background = bg;
    if (attrs & ATTR.INVERSE) {
        color = bg ?? DEFAULT_BG;
        background = fg ?? DEFAULT_FG;
    }
    if (color) style.color = color;
    if (background) style.backgroundColor = background;
    if (attrs & ATTR.BOLD) style.fontWeight = 700;
    if (attrs & ATTR.DIM) style.opacity = DIM_OPACITY;
    if (attrs & ATTR.ITALIC) style.fontStyle = 'italic';
    const decorations = [attrs & ATTR.UNDERLINE && 'underline', attrs & ATTR.STRIKETHROUGH && 'line-through'].filter(Boolean);
    if (decorations.length) style.textDecorationLine = decorations.join(' ');
    if (attrs & ATTR.HIDDEN) style.visibility = 'hidden';
    return style;
}
