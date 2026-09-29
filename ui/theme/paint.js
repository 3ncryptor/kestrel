// Turns a semantic role into span props. In no-color mode meaning moves from color to attributes
// (dim for quiet, bold for attention), so nothing depends on color alone (UI_SPEC §3.3, §10).
import { TextAttributes } from '@opentui/core';

const ROLE_PATHS = {
    primary: ['fg', 'primary'],
    secondary: ['fg', 'secondary'],
    muted: ['fg', 'muted'],
    ok: ['state', 'ok'],
    warn: ['state', 'warn'],
    danger: ['state', 'danger'],
    transient: ['state', 'transient'],
    inactive: ['state', 'inactive'],
    info: ['state', 'info'],
    focus: ['accent', 'focus'],
    managed: ['accent', 'managed'],
    cpu: ['series', 'cpu'],
    mem: ['series', 'mem'],
    faint: ['border', 'idle'],
};

const MONO_ATTRIBUTES = {
    muted: TextAttributes.DIM,
    inactive: TextAttributes.DIM,
    warn: TextAttributes.BOLD,
    danger: TextAttributes.BOLD | TextAttributes.UNDERLINE,
    focus: TextAttributes.BOLD,
    faint: TextAttributes.DIM,
};

/**
 * @param {ReturnType<import('./capabilities.js').resolveTheme>} theme
 * @param {keyof typeof ROLE_PATHS} role
 * @param {{ bold?: boolean }} [options]
 */
export function paint(theme, role, { bold = false } = {}) {
    const [group, token] = ROLE_PATHS[role];
    const base = bold ? TextAttributes.BOLD : TextAttributes.NONE;
    if (theme.mono) return { fg: undefined, attributes: base | (MONO_ATTRIBUTES[role] ?? TextAttributes.NONE) };
    return { fg: theme[group][token], attributes: base };
}

/** Role for a VALUE at a threshold level: normal values stay neutral. */
export const valueRole = (level) => (level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : 'primary');

/** Role for a status CARRIER (glyph, meter): ok is green. */
export const carrierRole = (level) => (level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : 'ok');

/** Background/attributes for the selected row: surface color, or reverse video without color. */
export function selectedRow(theme) {
    return theme.mono ? { bg: undefined, attributes: TextAttributes.INVERSE } : { bg: theme.bg.selected, attributes: TextAttributes.NONE };
}

/** Gradient band (ui/logic/charts.gradientLevel) → role: green → yellow → peach → red (UI_SPEC §3.2). */
const GRADIENT_ROLES = { low: 'ok', mid: 'warn', high: 'transient', max: 'danger', empty: 'faint' };
export const gradientRole = (level) => GRADIENT_ROLES[level] || 'primary';

/** Threshold level (core selectors.thresholdLevel) → role, for memory figures. */
export const thresholdRole = (level) => (level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : 'ok');
