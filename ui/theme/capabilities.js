// Color depth detection and theme resolution (UI_SPEC §3.3).
//
// Verified in M2 (spike): OpenTUI downsamples truecolor to xterm-256 on its own when COLORTERM is
// absent and TERM says 256color (e.g. red #f38ba8 → 211, as UI_SPEC §3.1 predicts), but it ignores
// NO_COLOR. So Kestrel only decides WHICH tokens get a color; mapping colors is left to OpenTUI.
import { PALETTE, SEMANTIC } from './tokens.js';

/** @typedef {'truecolor'|'256'|'16'|'none'} ColorDepth */

/**
 * @param {{ env: Record<string, string|undefined>, noColor?: boolean }} input
 * @returns {ColorDepth}
 */
export function detectColorDepth({ env, noColor = false }) {
    if (noColor || (env.NO_COLOR !== undefined && env.NO_COLOR !== '')) return 'none';
    if (/^(truecolor|24bit)$/i.test(env.COLORTERM || '')) return 'truecolor';
    const term = env.TERM || '';
    if (term === 'dumb') return 'none';
    if (term.includes('256color')) return '256';
    return '16';
}

function mapGroups(pick) {
    return Object.fromEntries(
        Object.entries(SEMANTIC).map(([group, tokens]) => [
            group,
            Object.fromEntries(Object.entries(tokens).map(([token, paletteName]) => [token, pick(group, token, paletteName)])),
        ])
    );
}

/**
 * Semantic token → color string (or undefined = terminal default).
 * @param {ColorDepth} depth
 */
export function resolveTheme(depth) {
    if (depth === 'none') return { depth, mono: true, ...mapGroups(() => undefined) };
    // Below truecolor the app background is not painted: approximated dark greys look muddy, and
    // the user's own terminal background is the better choice (UI_SPEC §3.3).
    const skipAppBg = depth !== 'truecolor';
    return {
        depth,
        mono: false,
        ...mapGroups((group, token, name) => (skipAppBg && group === 'bg' && token === 'app' ? undefined : PALETTE[name])),
    };
}

/** Color for a VALUE at a threshold level: normal values stay neutral ("normal is quiet", UI_SPEC §2). */
export function valueColor(theme, level) {
    if (level === 'danger') return theme.state.danger;
    if (level === 'warn') return theme.state.warn;
    return theme.fg.primary;
}

/** Color for a status CARRIER (glyphs, meters): here green is allowed. */
export function levelColor(theme, level) {
    if (level === 'danger') return theme.state.danger;
    if (level === 'warn') return theme.state.warn;
    return theme.state.ok;
}
