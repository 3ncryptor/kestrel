import { expect, test } from 'bun:test';
import { PALETTE, SEMANTIC, STATUS_GLYPHS } from '../../ui/theme/tokens.js';
import { detectColorDepth, resolveTheme, valueColor } from '../../ui/theme/capabilities.js';

test('detectColorDepth follows NO_COLOR, --no-color, COLORTERM and TERM', () => {
    expect(detectColorDepth({ env: { COLORTERM: 'truecolor', TERM: 'xterm-256color' } })).toBe('truecolor');
    expect(detectColorDepth({ env: { COLORTERM: '24bit' } })).toBe('truecolor');
    expect(detectColorDepth({ env: { TERM: 'xterm-256color' } })).toBe('256');
    expect(detectColorDepth({ env: { TERM: 'tmux-256color' } })).toBe('256');
    expect(detectColorDepth({ env: { TERM: 'xterm' } })).toBe('16');
    expect(detectColorDepth({ env: { TERM: 'dumb' } })).toBe('none');
    expect(detectColorDepth({ env: { NO_COLOR: '1', COLORTERM: 'truecolor' } })).toBe('none');
    expect(detectColorDepth({ env: { NO_COLOR: '' , COLORTERM: 'truecolor' } })).toBe('truecolor');
    expect(detectColorDepth({ env: { COLORTERM: 'truecolor' }, noColor: true })).toBe('none');
});

test('every semantic token points at a palette color', () => {
    for (const group of Object.values(SEMANTIC)) {
        for (const name of Object.values(group)) expect(PALETTE[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
});

test('the app background is pure black, and the dark surfaces are neutral grey (no blue tint)', () => {
    expect(PALETTE.base).toBe('#000000');
    for (const name of ['mantle', 'surface0', 'surface1']) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(PALETTE[name].slice(i, i + 2), 16));
        expect(r === g && g === b, name).toBe(true);
    }
});

test('truecolor resolves every token to hex and paints the app background', () => {
    const theme = resolveTheme('truecolor');
    expect(theme.mono).toBe(false);
    expect(theme.bg.app).toBe(PALETTE.base);
    expect(theme.state.danger).toBe(PALETTE.red);
    expect(theme.accent.focus).toBe(PALETTE.mauve);
});

test('256-color mode leaves the terminal background alone (UI_SPEC §3.3)', () => {
    const theme = resolveTheme('256');
    expect(theme.bg.app).toBeUndefined();
    expect(theme.bg.selected).toBe(PALETTE.surface0);
    expect(theme.state.ok).toBe(PALETTE.green);
});

test('no-color mode has no colors at all, so attributes and glyphs carry meaning', () => {
    const theme = resolveTheme('none');
    expect(theme.mono).toBe(true);
    const values = Object.values(theme).filter((v) => typeof v === 'object').flatMap((g) => Object.values(g));
    expect(values.every((v) => v === undefined)).toBe(true);
});

test('valueColor keeps normal values quiet and colors only crossed thresholds', () => {
    const theme = resolveTheme('truecolor');
    expect(valueColor(theme, 'ok')).toBe(PALETTE.text);
    expect(valueColor(theme, 'warn')).toBe(PALETTE.yellow);
    expect(valueColor(theme, 'danger')).toBe(PALETTE.red);
});

test('every managed status has a glyph (color is never the only signal)', () => {
    for (const status of ['running', 'starting', 'unready', 'restarting', 'errored', 'crashed', 'blocked', 'idle', 'stopped', 'exited', 'stopping']) {
        expect(STATUS_GLYPHS[status]?.glyph?.length).toBeGreaterThan(0);
    }
});

// WCAG 2.x contrast ratio between two hex colors.
function contrast(a, b) {
    const lum = (hex) => {
        const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

test('text and every state color reach 4.5:1 on the app background (UI_SPEC §10)', () => {
    for (const name of ['text', 'subtext', 'green', 'yellow', 'peach', 'red', 'mauve', 'blue', 'lavender', 'teal']) {
        expect(contrast(PALETTE[name], PALETTE.base)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(PALETTE[name], PALETTE.surface0)).toBeGreaterThanOrEqual(3); // selected row
    }
    // overlay0 is only for non-essential labels (units, hints), as the spec allows.
    expect(contrast(PALETTE.overlay0, PALETTE.base)).toBeGreaterThanOrEqual(3);
});
