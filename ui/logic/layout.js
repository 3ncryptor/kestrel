// Responsive layout rules (UI_SPEC §4.2) and table geometry. Pure.

export const MIN_WIDTH = 60;
export const MIN_HEIGHT = 16;
const COMPACT_MAX = 99;
const STANDARD_MAX = 139;
const MIN_NAME_WIDTH = 10;
const MIN_COMMAND_WIDTH = 20;

/** @returns {'tooSmall'|'compact'|'standard'|'wide'} */
export function breakpoint(width, height) {
    if (width < MIN_WIDTH || height < MIN_HEIGHT) return 'tooSmall';
    if (width <= COMPACT_MAX) return 'compact';
    if (width <= STANDARD_MAX) return 'standard';
    return 'wide';
}

const FIXED = {
    pid: { key: 'pid', label: 'PID', width: 7, align: 'right' },
    user: { key: 'user', label: 'User', width: 13, align: 'left' },
    cpu: { key: 'cpu', label: 'Cpu%', width: 5, align: 'right' },
    meter: { key: 'meter', label: '', width: 4, align: 'left' },
    mem: { key: 'mem', label: 'Mem', width: 8, align: 'right' },
    state: { key: 'state', label: 'State', width: 8, align: 'left' },
};

/**
 * Columns for the process table at `width` characters (each column is followed by one space).
 * NAME takes the leftover width; in wide layouts COMMAND shares it.
 */
export function processColumns(bp, width) {
    const fixed = bp === 'compact' ? [FIXED.pid, FIXED.cpu, FIXED.meter, FIXED.mem] : [FIXED.pid, FIXED.user, FIXED.cpu, FIXED.meter, FIXED.mem, FIXED.state];
    const flexCount = bp === 'wide' ? 2 : 1;
    const used = fixed.reduce((sum, c) => sum + c.width + 1, 0) + flexCount;
    const free = Math.max(MIN_NAME_WIDTH, width - used);
    const nameWidth = bp === 'wide' ? Math.max(MIN_NAME_WIDTH, Math.floor(free * 0.4)) : free;
    const name = { key: 'name', label: 'Program', width: nameWidth, align: 'left' };
    const order = bp === 'compact'
        ? [FIXED.pid, name, FIXED.cpu, FIXED.meter, FIXED.mem]
        : [FIXED.pid, name, FIXED.user, FIXED.cpu, FIXED.meter, FIXED.mem, FIXED.state];
    if (bp !== 'wide') return order;
    const command = { key: 'command', label: 'Command', width: Math.max(MIN_COMMAND_WIDTH, free - nameWidth), align: 'left' };
    return [...order, command];
}

/** First visible row so the selected row stays on screen (kept centered while scrolling). */
export function windowStart(selectedIndex, total, rows) {
    if (total <= rows) return 0;
    const centered = selectedIndex - Math.floor(rows / 2);
    return Math.max(0, Math.min(centered, total - rows));
}

/**
 * Tree guide prefixes (`├─`, `└─`, `│ `) for depth-first rows from core/store/selectors.buildTree.
 * A row is the last child when no later sibling appears before the tree climbs above its depth.
 */
export function treeGuides(rows) {
    const isLast = new Array(rows.length);
    let seenAtDepth = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        const d = rows[i].depth;
        isLast[i] = !seenAtDepth[d];
        seenAtDepth = [...seenAtDepth.slice(0, d), true];
    }
    let open = [];
    return rows.map((row, i) => {
        const d = row.depth;
        if (d === 0) {
            open = [!isLast[i]];
            return '';
        }
        const rails = open.slice(1, d).map((more) => (more ? '│ ' : '  ')).join('');
        open = [...open.slice(0, d), !isLast[i]];
        return `${rails}${isLast[i] ? '└─' : '├─'}`;
    });
}

/** Ports matching the Monitor filter (port number, address or process name). */
export function visiblePorts(items, query) {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => String(p.port).includes(q) || p.address.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
}

const LEFT_WIDTH = { compact: 26, standard: 32, wide: 36 };
// Compact terminals use short core meters so every core fits next to the graph.
const MAX_CORE_COLS = { compact: 3, standard: 2, wide: 3 };
const CORE_METER = { compact: 4, standard: 10, wide: 10 };
const MEM_BOX_HEIGHT = 6; // 4 meters + 2 borders
const CPU_SHARE = 0.28;
const CPU_MIN = 6;
const CPU_MAX = 12;
const COMPACT_CPU = 5;
const BORDER = 2;

const MIN_PORTS_HEIGHT = 3;

/**
 * Box geometry for the btop-style dashboard (UI_SPEC §4): cpu across the top; mem, managed and ports
 * on the left; the big panel (proc, or logs while managed has focus) on the right. The boxes always
 * tile the given area exactly. `managedRows` is the managed box's content (0: no managed box, as in
 * `kestrel sm`); the box grows with it up to half the left column.
 */
export function dashboardLayout(width, height, coreCount, bp, managedRows = 0) {
    const cpuHeight = bp === 'compact' ? COMPACT_CPU : Math.min(CPU_MAX, Math.max(CPU_MIN, Math.round(height * CPU_SHARE)));
    const contentRows = cpuHeight - BORDER;
    const meterWidth = CORE_METER[bp] || 10;
    const coreColWidth = 4 + meterWidth + 1 + 4 + 2; // "C12 " + meter + " " + "100%" + gap
    const needed = Math.max(1, Math.ceil(coreCount / contentRows));
    const coreCols = Math.min(needed, MAX_CORE_COLS[bp] || 1);
    const graphWidth = Math.max(10, width - BORDER - 2 - coreCols * coreColWidth - 1);
    const leftWidth = LEFT_WIDTH[bp] || LEFT_WIDTH.standard;
    const lowerHeight = height - cpuHeight;
    const memHeight = Math.min(MEM_BOX_HEIGHT, Math.max(3, lowerHeight - 3));
    const managedRoom = Math.max(0, Math.min(Math.floor(lowerHeight / 2), lowerHeight - memHeight - MIN_PORTS_HEIGHT));
    const managedHeight = managedRows > 0 ? Math.min(managedRows + BORDER, managedRoom) : 0;
    return {
        cpu: { width, height: cpuHeight, graphWidth, graphHeight: Math.max(1, contentRows - 1), coreCols, coreRows: contentRows, coreColWidth, meterWidth },
        left: { width: leftWidth },
        mem: { width: leftWidth, height: memHeight },
        managed: { width: leftWidth, height: managedHeight },
        ports: { width: leftWidth, height: lowerHeight - memHeight - managedHeight },
        proc: { width: width - leftWidth, height: lowerHeight },
    };
}
