// Floating panels: safety dialogs, the detail drawer and the help overlay (UI_SPEC §6.2, §6.4).
import { useTheme } from '../theme/context.js';
import { Tone } from './primitives.jsx';
import { canSubmit } from '../logic/dialog.js';
import { formatDuration, truncateMiddle } from '../logic/format.js';

const DIALOG_WIDTH = 52;

export function Panel({ title, borderRole = 'focus', width, height, children, left, top }) {
    const theme = useTheme();
    const border = borderRole === 'danger' ? theme.state.danger : theme.border.focus;
    return (
        <box
            position="absolute"
            left={left}
            top={top}
            width={width}
            height={height}
            zIndex={10}
            border
            borderStyle="rounded"
            borderColor={border}
            title={` ${title} `}
            titleColor={border}
            backgroundColor={theme.bg.bar}
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
        >
            {children}
        </box>
    );
}

export const Line = ({ children }) => <text wrapMode="none">{children}</text>;
export const Blank = () => <text> </text>;

function dialogTitle(d) {
    if (d.kind === 'blocked') return "Can't do that";
    if (d.kind === 'renice') return 'Change priority';
    if (d.kind === 'managed') return `${d.managedId || d.name} is managed by Kestrel`;
    if (d.kind === 'typeName') return 'Kill a system process';
    return d.signal === 'SIGKILL' ? 'Force kill process?' : 'Stop process?';
}

function DialogBody({ d }) {
    const who = `${d.name} · pid ${d.pid} · ${d.user}`;
    const input = (
        <Line>
            <Tone role="focus">&gt; </Tone>
            <Tone role="primary">{d.typed}</Tone>
            <Tone role="focus">█</Tone>
        </Line>
    );
    switch (d.kind) {
        case 'blocked':
            return <Line><Tone role="primary">{d.reason}</Tone></Line>;
        case 'renice':
            return (
                <>
                    <Line><Tone role="primary">{who}</Tone></Line>
                    <Line><Tone role="secondary">Nice value (-20 highest … 20 lowest):</Tone></Line>
                    {input}
                    <Line><Tone role="muted">Raising priority (lower values) usually needs sudo.</Tone></Line>
                </>
            );
        case 'managed':
            return (
                <>
                    <Line><Tone role="primary">{who}</Tone></Line>
                    <Line><Tone role="secondary">Killing it will trigger auto-restart.</Tone></Line>
                    <Line><Tone role="secondary">m stops it cleanly through the manager.</Tone></Line>
                </>
            );
        case 'typeName':
            return (
                <>
                    <Line><Tone role="danger">! </Tone><Tone role="primary">{who}</Tone></Line>
                    <Line><Tone role="secondary">It belongs to another user; this can affect the whole system.</Tone></Line>
                    <Line><Tone role="secondary">Type the name to confirm:</Tone></Line>
                    {input}
                </>
            );
        default:
            return (
                <>
                    <Line><Tone role="primary">{who}</Tone></Line>
                    <Line><Tone role="secondary">Sends {d.signal}{d.signal === 'SIGTERM' ? ' (X for SIGKILL)' : ''}.</Tone></Line>
                </>
            );
    }
}

function dialogKeys(d) {
    if (d.kind === 'blocked') return 'Esc ok';
    if (d.kind === 'renice') return canSubmit(d) ? '⏎ apply   Esc cancel' : 'Esc cancel';
    if (d.kind === 'typeName') return canSubmit(d) ? '⏎ kill   Esc cancel' : 'Esc cancel';
    if (d.kind === 'managed') return 'm stop via manager   y kill anyway   Esc';
    return `y ${d.signal === 'SIGKILL' ? 'kill' : 'stop'}   Esc cancel`;
}

export function Dialog({ dialog, width, height }) {
    const w = Math.min(DIALOG_WIDTH, width - 4);
    const h = dialog.kind === 'typeName' ? 9 : 8;
    return (
        <Panel
            title={dialogTitle(dialog)}
            borderRole={dialog.kind === 'renice' || dialog.kind === 'blocked' ? 'focus' : 'danger'}
            width={w}
            height={h}
            left={Math.max(0, Math.floor((width - w) / 2))}
            top={Math.max(0, Math.floor((height - h) / 2))}
        >
            <DialogBody d={dialog} />
            <Blank />
            <Line><Tone role="secondary">{dialogKeys(dialog)}</Tone></Line>
        </Panel>
    );
}

export function Drawer({ info, width, height }) {
    if (!info) return null;
    const { process: p, parents, nice } = info;
    const chain = [...parents.map((x) => x.name), p.name].join(' › ');
    const uptime = p.startedAt ? formatDuration((Date.now() - p.startedAt) / 1000) : '—';
    return (
        <box width={width} height={height} border borderStyle="rounded" title=" DETAILS " flexDirection="column" paddingLeft={1} paddingRight={1}>
            <Line><Tone role="primary" bold>{p.name}</Tone></Line>
            <Line><Tone role="secondary">pid {p.pid} · {p.user} · {p.state}</Tone></Line>
            <Blank />
            <Line><Tone role="muted">command </Tone><Tone role="primary">{truncateMiddle(p.command, width - 12)}</Tone></Line>
            <Line><Tone role="muted">parents</Tone></Line>
            <Line><Tone role="primary">{chain}</Tone></Line>
            <Line><Tone role="muted">running </Tone><Tone role="primary">{uptime}</Tone></Line>
            <Line><Tone role="muted">nice    </Tone><Tone role="primary">{nice ?? '—'}</Tone></Line>
            <Blank />
            <Line><Tone role="secondary">x kill · r renice · Esc close</Tone></Line>
        </box>
    );
}

export function HelpOverlay({ groups, width, height }) {
    const w = Math.min(72, width - 4);
    const rows = groups.reduce((n, g) => n + g.entries.length + 2, 0);
    const h = Math.min(height - 2, rows + 3);
    return (
        <Panel title="KEYS" width={w} height={h} left={Math.floor((width - w) / 2)} top={1}>
            {groups.map((g) => (
                <box key={g.title} flexDirection="column">
                    <Line><Tone role="focus" bold>{g.title}</Tone></Line>
                    {g.entries.map((e) => (
                        <Line key={e.action + e.label}><Tone role="secondary">  {e.label}</Tone></Line>
                    ))}
                    <Blank />
                </box>
            ))}
        </Panel>
    );
}
