// btop-style building blocks (UI_SPEC §4.1): a box with a colored title and info in its top border and
// key hints in its bottom border, plus gradient meters and graphs.
import { useTheme } from '../theme/context.js';
import { paint, gradientRole } from '../theme/paint.js';
import { meterSegments, brailleGraph, blockGraph, gradientLevel } from '../logic/charts.js';

const TOAST_ROLE = { ok: 'secondary', info: 'info', warn: 'warn', danger: 'danger' };

const partsLength = (parts) => parts.reduce((n, p) => n + p.text.length, 0);
// Corners, the dashes next to them and the spaces around the right-hand text.
const BORDER_CHROME = 6;

/** Cuts parts to `max` characters, ending in "…". */
function clipParts(parts, max) {
    const out = [];
    let room = max;
    for (const p of parts) {
        if (room <= 0) break;
        const text = p.text.length <= room ? p.text : `${p.text.slice(0, Math.max(0, room - 1))}…`;
        out.push({ ...p, text });
        room -= text.length;
    }
    return out;
}

/** One line of the border, e.g. `╭─ cpu ───── load 1.2 ─╮`, as colored spans. Never wider than `width`. */
function BorderLine({ left, right, width, corners, borderRole, clip = true }) {
    const theme = useTheme();
    const border = paint(theme, borderRole);
    const [open, close] = corners;
    const room = Math.max(0, width - BORDER_CHROME);
    // The left side (title or hints) was already fitted; the right side gets what is left.
    const leftParts = clipParts(left, room);
    const leftLen = partsLength(leftParts);
    const rightRoom = Math.max(0, room - leftLen);
    // Toasts may be clipped; a plain hint (like "? help  q quit") is shown whole or not at all.
    const rightParts = !clip && partsLength(right) > rightRoom ? [] : clipParts(right, rightRoom);
    const rightLen = partsLength(rightParts);
    const fill = Math.max(0, width - 2 - 1 - leftLen - (rightLen ? rightLen + 2 : 0) - 1);
    return (
        <text wrapMode="none">
            <span {...border}>{open}─</span>
            {leftParts.map((p, i) => <span key={`l${i}`} {...paint(theme, p.role, { bold: p.bold })}>{p.text}</span>)}
            <span {...border}>{'─'.repeat(fill)}{rightLen ? ' ' : ''}</span>
            {rightParts.map((p, i) => <span key={`r${i}`} {...paint(theme, p.role, { bold: p.bold })}>{p.text}</span>)}
            <span {...border}>{rightLen ? ' ' : ''}─{close}</span>
        </text>
    );
}

/**
 * Keymap entries → bottom-border parts (key in the box accent, word muted, `─` between), keeping only
 * as many whole hints as fit in `max` characters.
 */
function hintParts(hints, accentRole, max) {
    let shown = hints.length;
    const build = (list) => list.flatMap((h, i) => {
        const [key, ...rest] = h.label.split(' ');
        return [
            ...(i > 0 ? [{ text: ' ─ ', role: 'faint' }] : [{ text: ' ', role: 'faint' }]),
            { text: key, role: accentRole, bold: true },
            { text: rest.length ? ` ${rest.join(' ')}` : '', role: 'secondary' },
        ];
    }).concat(list.length ? [{ text: ' ', role: 'faint' }] : []);
    while (shown > 0 && partsLength(build(hints.slice(0, shown))) > max) shown -= 1;
    return build(hints.slice(0, shown));
}

/**
 * @param {{ title: string, accent: string, info?: Array<{text: string, role: string, bold?: boolean}>,
 *           hints?: any[], status?: any, focused?: boolean, width: number, height: number, children?: any }} props
 */
export function Box({ title, accent, info = [], hints = [], status = null, focused = false, width, height, children }) {
    const theme = useTheme();
    const borderRole = focused ? 'focus' : 'faint';
    const sideColor = focused ? theme.border.focus : theme.border.idle;
    const top = [{ text: ` ${title} `, role: accent, bold: true }];
    const bottomRight = status ? [{ text: status.message, role: TOAST_ROLE[status.level] || status.role || 'secondary' }] : [];
    // A toast (an action's result) always stays readable; hints give way to it.
    const hintRoom = Math.max(0, width - BORDER_CHROME - (status?.level ? Math.min(partsLength(bottomRight) + 2, width - BORDER_CHROME) : 0));
    return (
        <box flexDirection="column" width={width} height={height}>
            <BorderLine left={top} right={info} width={width} corners={['╭', '╮']} borderRole={borderRole} />
            <box border={['left', 'right']} borderColor={sideColor} height={Math.max(0, height - 2)} flexDirection="column" paddingLeft={1} paddingRight={1}>
                {children}
            </box>
            <BorderLine left={focused ? hintParts(hints, accent, hintRoom) : []} right={bottomRight} width={width} corners={['╰', '╯']} borderRole={borderRole} clip={Boolean(status?.level)} />
        </box>
    );
}

/** A gradient meter: each filled cell colored by its own position (UI_SPEC §3.2). */
export function Meter({ value, width, max = 100 }) {
    const theme = useTheme();
    return (
        <>
            {meterSegments(value, width, max).map((s, i) => (
                <span key={i} {...paint(theme, gradientRole(s.level))}>{s.text}</span>
            ))}
        </>
    );
}

/**
 * History graph rows, top first. Braille (2 samples per cell) in color; block characters without
 * color. Each row is one span colored by its height, so the graph reads green at the bottom and red
 * at the top, as in btop.
 */
export function graphRows(values, width, height, mono) {
    const rows = mono ? blockGraph(values, width, height) : brailleGraph(values, width, height);
    return rows.map((text, r) => ({ text, role: gradientRole(gradientLevel(((height - 1 - r) / height) * 100)) }));
}
