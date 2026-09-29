// The managed box (UI_SPEC §6.5): one line per process of the stack (glyph, name, status, cpu), or
// what to do when there is no stack yet (S2) or its config is invalid (S3).
import { Box } from './box.jsx';
import { Tone } from './primitives.jsx';
import { statusLabel, readySummary, selectedManaged } from '../logic/managed.js';
import { windowStart } from '../logic/layout.js';
import { formatPercent, padEnd, padStart, truncateEnd } from '../logic/format.js';
import { GLYPHS, STATUS_GLYPHS } from '../theme/tokens.js';

const INNER = 4;
const MAX_NAME = 12;
const MIN_NAME = 4;
const CPU_WIDTH = 5;
const SHOW_CPU_FROM = 26; // inner width at which the cpu column fits beside a useful label

const LABEL_ROLES = { errored: 'danger', crashed: 'danger', unready: 'warn', blocked: 'warn', restarting: 'transient' };

function ManagedRow({ m, selected, nameWidth, width, now }) {
    const glyph = STATUS_GLYPHS[m.status] || STATUS_GLYPHS.idle;
    // Only a live process has a cpu figure; otherwise its label gets the room.
    const showCpu = width >= SHOW_CPU_FROM && m.pid !== null && Boolean(m.resources);
    const labelWidth = Math.max(1, width - 2 - 2 - nameWidth - 1 - (showCpu ? CPU_WIDTH : 0));
    const cpu = showCpu ? padStart(formatPercent(m.resources.cpu), CPU_WIDTH) : '';
    return (
        <text wrapMode="none">
            <Tone role="focus">{selected ? GLYPHS.selection : ' '}</Tone>
            <Tone role={glyph.state}>{glyph.glyph} </Tone>
            <Tone role={selected ? 'focus' : 'primary'} bold={selected}>{padEnd(m.id, nameWidth)} </Tone>
            <Tone role={LABEL_ROLES[m.status] || 'secondary'}>{padEnd(statusLabel(m, now), labelWidth)}</Tone>
            {showCpu ? <Tone role="muted">{cpu}</Tone> : null}
        </text>
    );
}

function emptyLines(stack) {
    if (stack.errors.length) {
        const count = stack.errors.length;
        return [
            { role: 'danger', text: `${STATUS_GLYPHS.errored.glyph} config has ${count} problem${count === 1 ? '' : 's'}` },
            ...stack.errors.map((e) => ({ role: 'muted', text: `${e.path} ${e.message}` })),
        ];
    }
    if (stack.scripts) return [{ role: 'secondary', text: `package.json: ${stack.scripts.length} scripts` }, { role: 'focus', text: '⏎ pick the ones to run' }];
    return [{ role: 'secondary', text: 'No stack here' }, { role: 'muted', text: 'kestrel init · n add a process' }];
}

/** @param {{ state: any, layout: { width: number, height: number }, focused: boolean, hints: any[], now: number }} props */
export function ManagedBox({ state, layout, focused, hints, now }) {
    const { managed, stack } = state;
    const width = layout.width - INNER;
    const rows = Math.max(0, layout.height - 2);
    const selected = selectedManaged(state);
    const title = stack.name ? `managed · ${stack.name}` : 'managed';
    const info = managed.length ? [{ text: readySummary(managed), role: 'muted' }] : [];
    const nameWidth = Math.min(MAX_NAME, Math.max(MIN_NAME, ...managed.map((m) => m.id.length)));
    const selectedIndex = Math.max(0, managed.findIndex((m) => m === selected));
    const start = windowStart(selectedIndex, managed.length, rows);
    return (
        <Box title={title} accent="managed" info={info} hints={hints} focused={focused} width={layout.width} height={layout.height}>
            {managed.length
                ? managed.slice(start, start + rows).map((m) => (
                    <ManagedRow key={m.id} m={m} selected={focused && m === selected} nameWidth={nameWidth} width={width} now={now} />
                ))
                : emptyLines(stack).slice(0, rows).map((l, i) => (
                    <text key={i} wrapMode="none"><Tone role={l.role}>{truncateEnd(l.text, width)}</Tone></text>
                ))}
        </Box>
    );
}
