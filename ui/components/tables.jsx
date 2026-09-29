// Process table (flat and tree), ports table and the per-core row (UI_SPEC §6.2, §6.3).
import { memo } from 'react';
import { useTheme } from '../theme/context.js';
import { paint, selectedRow, gradientRole, thresholdRole } from '../theme/paint.js';
// Pure helper shared with the core, so the UI and the store classify thresholds identically.
import { thresholdLevel } from '../../core/store/selectors.js';
import { formatCpu, formatMem, padEnd, padStart, truncateEnd, truncateMiddle } from '../logic/format.js';
import { meterSegments, gradientLevel } from '../logic/charts.js';
import { treeGuides, windowStart } from '../logic/layout.js';
import { GLYPHS } from '../theme/tokens.js';
import { Tone } from './primitives.jsx';

const pad = (col, text) => (col.align === 'right' ? padStart(text, col.width) : padEnd(text, col.width));

function nameCell(row, col, guide) {
    const fold = row.hasChildren ? (row.collapsed ? `${GLYPHS.folded} ` : `${GLYPHS.expanded} `) : '';
    const prefix = `${guide}${guide ? ' ' : ''}${fold}`;
    const available = Math.max(1, col.width - prefix.length);
    // The badge gets at most half the room, so a long managed id can never widen the column.
    const badge = row.managedId ? truncateEnd(` ${GLYPHS.managed}${row.managedId}`, Math.floor(available / 2)) : '';
    return { prefix, name: padEnd(row.name, available - badge.length), badge };
}

/** Text for every non-name cell. */
function cellText(row, col) {
    switch (col.key) {
        case 'pid':
            return pad(col, row.pid);
        case 'user':
            return pad(col, row.user);
        case 'cpu':
            return pad(col, formatCpu(row.cpu));
        case 'mem':
            return pad(col, formatMem(row.memMB));
        case 'state':
            return pad(col, row.state);
        default:
            return truncateMiddle(row.command, col.width);
    }
}

const CELL_ROLES = { pid: 'muted', user: 'secondary', state: 'secondary', command: 'muted' };

/**
 * A row as a flat list of { role, text } segments, adjacent same-role text merged. Measured in M2:
 * per-span React updates dominated the UI's CPU, so fewer spans (and memoized rows) matter.
 */
export function rowSegments(row, columns, { selected, guide, thresholds }) {
    const segments = [{ role: 'focus', text: `${selected ? GLYPHS.selection : ' '} ` }];
    const push = (role, text) => {
        const last = segments[segments.length - 1];
        if (last.role === role) last.text += text;
        else segments.push({ role, text });
    };
    for (const col of columns) {
        if (col.key === 'name') {
            const n = nameCell(row, col, guide);
            push('muted', n.prefix);
            push(selected ? 'focus' : 'primary', n.name);
            if (n.badge) push('managed', n.badge);
            push(selected ? 'focus' : 'primary', ' ');
            continue;
        }
        if (col.key === 'meter') {
            // Inline CPU meter, btop-style: gradient cells, capped at one full core.
            for (const s of meterSegments(Math.min(100, row.cpu), col.width)) push(gradientRole(s.level), s.text);
            push('faint', ' ');
            continue;
        }
        const role = col.key === 'cpu' ? gradientRole(gradientLevel(Math.min(100, row.cpu)))
            : col.key === 'mem' ? thresholdRole(thresholdLevel(row.memMB, thresholds.memMB))
            : CELL_ROLES[col.key];
        push(role, `${cellText(row, col)} `);
    }
    return segments;
}

const ProcessRow = memo(
    function ProcessRow({ segments, selected }) {
        const theme = useTheme();
        const sel = selected ? selectedRow(theme) : { bg: undefined, attributes: 0 };
        return (
            <text bg={sel.bg} attributes={sel.attributes} wrapMode="none">
                {segments.map((s, i) => (
                    <span key={i} {...paint(theme, s.role)}>{s.text}</span>
                ))}
            </text>
        );
    },
    // Re-render only when what is visible changed (many rows sit at 0.0% CPU for a long time).
    (a, b) => a.signature === b.signature
);

const signatureOf = (segments, selected) => `${selected ? 1 : 0}${segments.map((s) => `${s.role}:${s.text}`).join('|')}`;

function ColumnHeader({ columns, sortBy, sortDir }) {
    const arrow = sortDir === 'desc' ? GLYPHS.sortDesc : GLYPHS.sortAsc;
    const sortCol = { mem: 'mem', cpu: 'cpu', pid: 'pid', name: 'name', user: 'user' }[sortBy];
    return (
        <text>
            <Tone role="muted">
                {'  '}
                {columns.map((c) => `${pad(c, c.key === sortCol ? `${c.label}${arrow}` : c.label)} `).join('')}
            </Tone>
        </text>
    );
}

export function ProcessTable({ rows, selectedPid, columns, height, ui, thresholds, emptyText }) {
    const guides = ui.monitorView === 'tree' ? treeGuides(rows) : null;
    const bodyRows = Math.max(1, height - 1);
    const selectedIndex = Math.max(0, rows.findIndex((r) => r.pid === selectedPid));
    const start = windowStart(selectedIndex, rows.length, bodyRows);
    const visible = rows.slice(start, start + bodyRows);
    return (
        <box flexDirection="column" height={height}>
            <ColumnHeader columns={columns} sortBy={ui.sortBy} sortDir={ui.sortDir} />
            {visible.length === 0 ? (
                <text>
                    <Tone role="muted">  {emptyText}</Tone>
                </text>
            ) : (
                visible.map((row, i) => {
                    const selected = row.pid === selectedPid;
                    const segments = rowSegments(row, columns, { selected, guide: guides ? guides[start + i] : '', thresholds });
                    // Positional keys: a scrolling table reuses each screen line instead of moving nodes.
                    return <ProcessRow key={i} segments={segments} selected={selected} signature={signatureOf(segments, selected)} />;
                })
            )}
        </box>
    );
}

/** Ports as a compact list for the left-column box: `:3000 node ◆api  127.0.0.1`. */
export function PortsList({ items, selectedIndex, rows, width, focused }) {
    const theme = useTheme();
    if (!items.length) return <text><Tone role="muted">no TCP listeners</Tone></text>;
    const start = windowStart(selectedIndex, items.length, rows);
    return items.slice(start, start + rows).map((p, i) => {
        const selected = focused && start + i === selectedIndex;
        const sel = selected ? selectedRow(theme) : { bg: undefined, attributes: 0 };
        const port = padEnd(`:${p.port}`, 7);
        const badge = p.managedId ? ` ${GLYPHS.managed}${p.managedId}` : '';
        const room = Math.max(4, width - port.length - badge.length - 11);
        return (
            <text key={`${p.pid}-${p.address}-${p.port}`} bg={sel.bg} attributes={sel.attributes} wrapMode="none">
                <Tone role={selected ? 'focus' : 'primary'} bold>{port}</Tone>
                <Tone role="primary">{padEnd(p.name ?? '—', room)}</Tone>
                <Tone role="managed">{badge}</Tone>
                <Tone role="muted"> {truncateEnd(p.address, 9)}</Tone>
            </text>
        );
    });
}
