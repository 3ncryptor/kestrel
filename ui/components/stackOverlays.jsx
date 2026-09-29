// Stack dialogs (UI_SPEC §6.6, M3): quit with a running stack (S12) and its progress, children left by a
// previous session (S13), a new ad-hoc process, a process's env, and the package.json script picker.
import { Panel, Line, Blank } from './overlays.jsx';
import { Tone } from './primitives.jsx';
import { canSubmit } from '../logic/dialog.js';
import { padEnd, truncateEnd } from '../logic/format.js';
import { STATUS_GLYPHS } from '../theme/tokens.js';

const WIDTH = 60;
const MASK = '••••••••';
const MAX_LIST = 8;

function centered({ title, borderRole = 'focus', width, height, rows, children }) {
    const w = Math.min(WIDTH, width - 4);
    const h = Math.min(height - 2, rows + 2);
    return (
        <Panel title={title} borderRole={borderRole} width={w} height={h} left={Math.max(0, Math.floor((width - w) / 2))} top={Math.max(0, Math.floor((height - h) / 2))}>
            {children(w - 4)}
        </Panel>
    );
}

const Keys = ({ text }) => <Line><Tone role="secondary">{text}</Tone></Line>;

const Input = ({ typed, room }) => (
    <Line>
        <Tone role="focus">&gt; </Tone>
        <Tone role="primary">{truncateEnd(typed, room - 3)}</Tone>
        <Tone role="focus">█</Tone>
    </Line>
);

function QuitBody({ d }) {
    return (
        <>
            <Line><Tone role="primary">Stop {d.count} running process{d.count === 1 ? '' : 'es'} and quit?</Tone></Line>
            <Line><Tone role="muted">They stop in reverse dependency order.</Tone></Line>
            <Blank />
            <Keys text="y stop and quit   Esc cancel" />
        </>
    );
}

function InputBody({ d, room }) {
    return (
        <>
            <Line><Tone role="secondary">name: command, or just a command</Tone></Line>
            <Input typed={d.typed} room={room} />
            <Blank />
            <Keys text={canSubmit(d) ? '⏎ start   Esc cancel' : 'Esc cancel'} />
        </>
    );
}

function EnvBody({ d, room }) {
    const keyWidth = Math.min(20, Math.max(4, ...d.vars.map(([k]) => k.length)));
    return (
        <>
            {d.vars.length ? null : <Line><Tone role="muted">No variables beyond the inherited environment.</Tone></Line>}
            {d.vars.slice(0, MAX_LIST).map(([key, value]) => (
                <Line key={key}>
                    <Tone role="secondary">{padEnd(key, keyWidth)} </Tone>
                    <Tone role="primary">{truncateEnd(d.revealed ? value : MASK, room - keyWidth - 1)}</Tone>
                </Line>
            ))}
            {d.vars.length > MAX_LIST ? <Line><Tone role="muted">+{d.vars.length - MAX_LIST} more</Tone></Line> : null}
            <Blank />
            <Keys text={`r ${d.revealed ? 'hide' : 'reveal'} values   Esc close`} />
        </>
    );
}

function PickerBody({ d, room }) {
    return (
        <>
            {d.items.map((it, i) => (
                <Line key={it.name}>
                    <Tone role="focus">{i === d.cursor ? '▌' : ' '}</Tone>
                    <Tone role={it.checked ? 'ok' : 'muted'}>[{it.checked ? 'x' : ' '}] </Tone>
                    <Tone role={i === d.cursor ? 'focus' : 'primary'}>{truncateEnd(it.name, 18).padEnd(18)} </Tone>
                    <Tone role="muted">{truncateEnd(it.command, Math.max(1, room - 24))}</Tone>
                </Line>
            ))}
            <Blank />
            <Keys text={canSubmit(d) ? '␣ toggle  ⏎ start  w start + save  Esc' : '␣ toggle   Esc cancel'} />
        </>
    );
}

const BODIES = { quit: QuitBody, input: InputBody, env: EnvBody, picker: PickerBody };
const TITLES = { quit: 'Quit Kestrel', input: 'New process', env: 'Environment', picker: 'Which scripts should run?' };

function dialogRows(d) {
    if (d.kind === 'env') return Math.min(d.vars.length, MAX_LIST) + (d.vars.length > MAX_LIST || !d.vars.length ? 1 : 0) + 2;
    if (d.kind === 'picker') return d.items.length + 2;
    return 4;
}

export function StackDialog({ dialog, width, height }) {
    const Body = BODIES[dialog.kind];
    const title = dialog.kind === 'env' ? `Environment · ${dialog.id}` : TITLES[dialog.kind];
    return centered({
        title,
        borderRole: dialog.kind === 'quit' ? 'danger' : 'focus',
        width,
        height,
        rows: dialogRows(dialog),
        children: (room) => <Body d={dialog} room={room} />,
    });
}

/** S13: processes a previous Kestrel started are still running (it was killed hard). */
export function OrphansPanel({ orphans, width, height }) {
    const shown = orphans.slice(0, MAX_LIST);
    const one = orphans.length === 1;
    return centered({
        title: 'Left running by a previous session',
        borderRole: 'danger',
        width,
        height,
        rows: shown.length + 4,
        children: () => (
            <>
                <Line><Tone role="primary">{one ? '1 process' : `${orphans.length} processes`} from a previous Kestrel {one ? 'is' : 'are'} still running:</Tone></Line>
                {shown.map((o) => <Line key={o.pid}><Tone role="secondary">  {o.id} · pid {o.pid}</Tone></Line>)}
                <Blank />
                <Keys text={one ? 's stop it   Esc leave it running' : 's stop them   Esc leave them running'} />
            </>
        ),
    });
}

/** S12 progress: each process as it stops, in the order the stack stops them. */
export function StoppingPanel({ progress, width, height }) {
    const entries = Object.entries(progress);
    return centered({
        title: 'Stopping the stack',
        width,
        height,
        rows: Math.max(1, entries.length),
        children: () => (entries.length
            ? entries.map(([id, phase]) => (
                <Line key={id}>
                    <Tone role={phase === 'stopped' ? 'ok' : 'warn'}>{phase === 'stopped' ? '✓' : STATUS_GLYPHS.stopping.glyph} </Tone>
                    <Tone role="primary">{id}</Tone>
                    <Tone role="muted"> {phase === 'stopped' ? 'stopped' : 'stopping…'}</Tone>
                </Line>
            ))
            : <Line><Tone role="muted">stopping…</Tone></Line>),
    });
}
