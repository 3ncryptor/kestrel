// Design tokens (UI_SPEC §3). This is the ONLY file with color values; components use semantic tokens.

/**
 * Soft pastel accents (Catppuccin-Mocha inspired) on a pure black base with neutral grey surfaces
 * (UI_SPEC §3.1; black chosen at the M2b review instead of Catppuccin's bluish base).
 */
export const PALETTE = Object.freeze({
    base: '#000000',
    mantle: '#121212',
    surface0: '#262626',
    surface1: '#3a3a3a',
    overlay0: '#6c7086',
    subtext: '#a6adc8',
    text: '#cdd6f4',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    peach: '#fab387',
    red: '#f38ba8',
    mauve: '#cba6f7',
    blue: '#89b4fa',
    lavender: '#b4befe',
    teal: '#94e2d5',
});

/** Meaning → palette name (UI_SPEC §3.2). Color carries meaning, never decoration. */
export const SEMANTIC = Object.freeze({
    fg: { primary: 'text', secondary: 'subtext', muted: 'overlay0' },
    state: { ok: 'green', warn: 'yellow', danger: 'red', transient: 'peach', inactive: 'overlay0', info: 'blue' },
    accent: { focus: 'mauve', managed: 'teal' },
    series: { cpu: 'blue', mem: 'lavender' },
    bg: { app: 'base', bar: 'mantle', selected: 'surface0' },
    border: { idle: 'surface1', focus: 'mauve' },
});

/** Every status has a glyph, so color is never the only signal (UI_SPEC §3.4). */
export const STATUS_GLYPHS = Object.freeze({
    running: { glyph: '●', state: 'ok' },
    starting: { glyph: '◌', state: 'warn' },
    unready: { glyph: '◍', state: 'warn' },
    restarting: { glyph: '↻', state: 'transient' },
    crashed: { glyph: '✕', state: 'danger' },
    errored: { glyph: '✕', state: 'danger' },
    blocked: { glyph: '⊘', state: 'inactive' },
    stopping: { glyph: '◌', state: 'inactive' },
    stopped: { glyph: '○', state: 'inactive' },
    exited: { glyph: '○', state: 'inactive' },
    idle: { glyph: '○', state: 'inactive' },
});

export const GLYPHS = Object.freeze({
    managed: '◆',
    alertWarn: '▲',
    alertDanger: '■',
    info: 'ℹ',
    selection: '▌',
    stderr: '▎',
    folded: '▸',
    expanded: '▾',
    sortDesc: '↓',
    sortAsc: '↑',
});
