// The btop-style dashboard (UI_SPEC §4.1): cpu across the top, mem and ports on the left, proc on the right.
import { useTheme } from '../theme/context.js';
import { gradientRole } from '../theme/paint.js';
import { Box, Meter, graphRows } from '../components/box.jsx';
import { Tone } from '../components/primitives.jsx';
import { ProcessTable, PortsList } from '../components/tables.jsx';
import { Drawer } from '../components/overlays.jsx';
import { ManagedBox } from '../components/managed.jsx';
import { LogsBox } from '../components/logs.jsx';
import { managedRows, selectedManaged } from '../logic/managed.js';
import { dashboardLayout, processColumns, visiblePorts } from '../logic/layout.js';
import { gradientLevel } from '../logic/charts.js';
import { formatDuration, formatMem, formatPercent, padEnd, padStart, truncateEnd } from '../logic/format.js';
import { GLYPHS } from '../theme/tokens.js';

const INNER = 4; // two border columns + one column of padding on each side
const DRAWER_SHARE = 0.4;

// ---------- cpu ----------

function coreCell(cores, index, meterWidth, width, lastSlot) {
    // More cores than slots (e.g. 64-core servers): the last slot says how many are not shown.
    if (index === lastSlot && cores.length > lastSlot + 1) {
        return <Tone role="muted">{padEnd(`+${cores.length - lastSlot} more`, width)}</Tone>;
    }
    if (index >= cores.length) return <span>{' '.repeat(width)}</span>;
    const v = cores[index];
    return (
        <span>
            <Tone role="muted">{padEnd(`C${index}`, 4)}</Tone>
            <Meter value={v} width={meterWidth} />
            <Tone role={gradientRole(gradientLevel(v))}>{padStart(`${Math.round(v)}%`, 5)}</Tone>
            <span>{'  '}</span>
        </span>
    );
}

function CpuBox({ state, layout, mono }) {
    const { system, history } = state;
    const { width, height, graphWidth, graphHeight, coreCols, coreRows, coreColWidth, meterWidth } = layout;
    const sampling = system.cpuPercent === null;
    const info = sampling
        ? [{ text: 'sampling…', role: 'muted' }]
        : [
            { text: `load ${system.load.map((n) => n.toFixed(1)).join(' ')}`, role: 'secondary' },
            { text: ` · up ${formatDuration(system.uptimeSec)}`, role: 'muted' },
        ];
    const graph = graphRows(history.cpu, graphWidth, graphHeight, mono);
    const total = sampling ? '—' : formatPercent(system.cpuPercent);
    const totalRole = sampling ? 'muted' : gradientRole(gradientLevel(system.cpuPercent));
    return (
        <Box title="cpu" accent="cpu" info={info} width={width} height={height}>
            {Array.from({ length: coreRows }, (_, r) => (
                <text key={r}>
                    {r < graphHeight ? (
                        <Tone role={graph[r].role}>{graph[r].text}</Tone>
                    ) : (
                        <>
                            <Tone role="primary" bold>CPU </Tone>
                            <Tone role={totalRole} bold>{padEnd(total, graphWidth - 4)}</Tone>
                        </>
                    )}
                    <span> </span>
                    {Array.from({ length: coreCols }, (_, c) => (
                        <span key={c}>{coreCell(system.cores, c * coreRows + r, meterWidth, coreColWidth, coreCols * coreRows - 1)}</span>
                    ))}
                </text>
            ))}
        </Box>
    );
}

// ---------- mem ----------

function MemBox({ state, layout }) {
    const { system } = state;
    const total = system.memTotalMB;
    const free = total !== null && system.memUsedMB !== null ? total - system.memUsedMB : null;
    const rows = [
        ['Used', system.memUsedMB, total],
        ['Cache', system.memCachedMB, total],
        ['Free', free, total],
        ['Swap', system.swapUsedMB, system.swapTotalMB],
    ];
    const meterWidth = Math.max(4, layout.width - INNER - 6 - 8);
    return (
        <Box title="mem" accent="mem" info={total ? [{ text: formatMem(total), role: 'muted' }] : []} width={layout.width} height={layout.height}>
            {rows.slice(0, Math.max(0, layout.height - 2)).map(([label, value, of]) => (
                <text key={label}>
                    <Tone role="secondary">{padEnd(label, 6)}</Tone>
                    <Meter value={value !== null && of ? (value / of) * 100 : 0} width={meterWidth} />
                    <Tone role="primary">{padStart(value === null ? '—' : formatMem(value), 8)}</Tone>
                </text>
            ))}
        </Box>
    );
}

// ---------- ports ----------

function PortsBox({ state, app, layout, focused, hints }) {
    const items = visiblePorts(state.ports.items, state.ui.filterQuery);
    const notice = state.ports.partial ? 1 : 0;
    const rows = Math.max(0, layout.height - 2 - notice);
    return (
        <Box title="ports" accent="managed" info={[{ text: String(items.length), role: 'muted' }]} hints={hints} focused={focused} width={layout.width} height={layout.height}>
            <PortsList items={items} selectedIndex={Math.min(app.portIndex, Math.max(0, items.length - 1))} rows={rows} width={layout.width - INNER} focused={focused} />
            {notice ? <text><Tone role="info">{truncateEnd(`${GLYPHS.info} yours only · sudo for all`, layout.width - INNER)}</Tone></text> : null}
        </Box>
    );
}

// ---------- proc ----------

function procInfo(ui, count, filtering) {
    const arrow = ui.sortDir === 'desc' ? GLYPHS.sortDesc : GLYPHS.sortAsc;
    const filter = filtering ? `${ui.filterQuery}█` : ui.filterQuery ? `${ui.filterQuery} ×` : '—';
    return [
        { text: 'filter: ', role: 'muted' },
        { text: filter, role: ui.filterQuery || filtering ? 'focus' : 'secondary' },
        { text: ' ─ ', role: 'faint' },
        { text: 'sort: ', role: 'muted' },
        { text: `${ui.sortBy} ${arrow}`, role: 'secondary' },
        { text: ' ─ ', role: 'faint' },
        { text: count, role: 'muted' },
    ];
}

function procStatus(state) {
    return state.ui.toast || { message: '? help  q quit', role: 'muted' };
}

/** Column set for the width the table actually has (it shrinks while the drawer is open). */
const columnsBreakpoint = (bp, width) => (width < 60 ? 'compact' : bp === 'wide' && width >= 100 ? 'wide' : 'standard');

function ProcBox({ state, app, layout, bp, focused, hints, drawerInfo }) {
    const { ui } = state;
    const count = ui.filterQuery ? `${state.processes.length} match` : `${state.processes.length} processes`;
    const drawerWidth = drawerInfo ? Math.floor(layout.width * DRAWER_SHARE) : 0;
    const tableWidth = layout.width - INNER - drawerWidth;
    const emptyText = ui.filterQuery ? `No processes match "${ui.filterQuery}" · Esc to clear` : 'sampling…';
    const borderHints = app.filtering ? [{ label: '⏎ keep', action: 'k' }, { label: 'Esc clear', action: 'c' }] : hints;
    return (
        <Box title="proc" accent="focus" info={procInfo(ui, count, app.filtering)} hints={borderHints} status={procStatus(state)} focused={focused || Boolean(drawerInfo)} width={layout.width} height={layout.height}>
            <box flexDirection="row" height={layout.height - 2}>
                <box width={tableWidth} flexDirection="column">
                    <ProcessTable
                        rows={state.processes}
                        selectedPid={ui.selectedPid}
                        columns={processColumns(columnsBreakpoint(bp, tableWidth), tableWidth - 2)}
                        height={layout.height - 2}
                        ui={ui}
                        thresholds={state.settings.thresholds}
                        emptyText={emptyText}
                    />
                </box>
                {drawerInfo ? <Drawer info={drawerInfo} width={drawerWidth} height={layout.height - 2} /> : null}
            </box>
        </Box>
    );
}

/** Layout for the current state: the managed box exists only with the process manager. */
export function layoutFor(state, env, width, height, bp) {
    const rows = env.managerAvailable ? managedRows(state) : 0;
    return dashboardLayout(width, height, state.system.cores.length, bp, rows);
}

/**
 * @param {{ state: any, app: any, env: any, width: number, height: number, bp: string, hints: any,
 *           drawerInfo: any, logView: any }} props
 *   `hints`: border hints per box ({ proc, managed, logs, ports }).
 */
export function Dashboard({ state, app, env, width, height, bp, hints, drawerInfo, logView }) {
    const theme = useTheme();
    const layout = layoutFor(state, env, width, height, bp);
    const focus = state.ui.focus;
    const showLogs = focus === 'managed' && env.managerAvailable;
    return (
        <box flexDirection="column" width={width} height={height}>
            <CpuBox state={state} layout={layout.cpu} mono={theme.mono} />
            <box flexDirection="row" height={layout.proc.height}>
                <box flexDirection="column" width={layout.left.width}>
                    <MemBox state={state} layout={layout.mem} />
                    {layout.managed.height ? <ManagedBox state={state} layout={layout.managed} focused={focus === 'managed'} hints={hints.managed} now={Date.now()} /> : null}
                    <PortsBox state={state} app={app} layout={layout.ports} focused={focus === 'ports'} hints={hints.ports} />
                </box>
                {showLogs
                    ? <LogsBox state={state} view={logView} entry={selectedManaged(state)} scope={app.logs.scope} searching={app.logSearching} layout={layout.proc} hints={hints.logs} />
                    : <ProcBox state={state} app={app} layout={layout.proc} bp={bp} focused={focus === 'proc'} hints={hints.proc} drawerInfo={drawerInfo} />}
            </box>
        </box>
    );
}

// Rows the big panel (proc table or logs) can show: used for PgUp/PgDn and the log window.
export function procPageSize(height, bp, coreCount) {
    const layout = dashboardLayout(100, height, coreCount, bp);
    return Math.max(1, layout.proc.height - 3);
}

export const logRows = (height, bp, coreCount) => Math.max(1, dashboardLayout(100, height, coreCount, bp).proc.height - 2);
