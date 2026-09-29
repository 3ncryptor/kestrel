// Pure derivations from raw samples to what the UI displays. Nothing here mutates its input.

/** @typedef {import('../sampler/cpu').SampledProcess} SampledProcess */

// UI sort keys → process fields ("mem" reads nicer in the UI than "memMB").
const SORT_FIELDS = { cpu: 'cpu', mem: 'memMB', pid: 'pid', name: 'name', user: 'user' };
const LEVEL_RANK = { ok: 0, warn: 1, danger: 2 };
const TOP_CONSUMERS = 5;

function matchesQuery(p, query) {
    return (
        p.name.toLowerCase().includes(query) ||
        (p.command || '').toLowerCase().includes(query) ||
        String(p.pid).includes(query)
    );
}

function comparator({ sortBy, sortDir }) {
    const field = SORT_FIELDS[sortBy] || 'cpu';
    const direction = sortDir === 'desc' ? -1 : 1;
    return (a, b) => {
        const av = a[field];
        const bv = b[field];
        const primary = typeof av === 'string' ? av.localeCompare(bv) : (av ?? -1) - (bv ?? -1);
        return direction * primary || a.pid - b.pid; // pid tie-break keeps row order stable
    };
}

/**
 * The first `n` items in `cmp` order, as a full sort would give them (ties included), in one pass
 * with a small sorted buffer instead of sorting everything.
 */
function topBy(items, n, cmp) {
    const top = [];
    for (const item of items) {
        if (top.length === n && cmp(item, top[n - 1]) >= 0) continue;
        let i = top.length;
        while (i > 0 && cmp(item, top[i - 1]) < 0) i -= 1;
        top.splice(i, 0, item);
        if (top.length > n) top.pop();
    }
    return top;
}

/** Filter then sort. */
function applyView(processes, { sortBy, sortDir, filterQuery }) {
    const query = filterQuery.trim().toLowerCase();
    const filtered = query ? processes.filter((p) => matchesQuery(p, query)) : processes;
    return [...filtered].sort(comparator({ sortBy, sortDir }));
}

/** Keeps the selection if it is still visible, otherwise selects the first row. */
function reconcileSelection(rows, selectedPid) {
    if (rows.some((p) => p.pid === selectedPid)) return selectedPid;
    return rows.length ? rows[0].pid : null;
}

/** @returns {'ok'|'warn'|'danger'} */
function thresholdLevel(value, [warn, danger]) {
    if (value >= danger) return 'danger';
    if (value >= warn) return 'warn';
    return 'ok';
}

function processLevel(p, thresholds) {
    const cpu = thresholdLevel(p.cpu, thresholds.cpu);
    const mem = thresholdLevel(p.memMB, thresholds.memMB);
    return LEVEL_RANK[cpu] >= LEVEL_RANK[mem] ? cpu : mem;
}

/** ppid → child pids. A process that is its own parent (pid 0/1 on some systems) is not a child. */
function indexChildren(processes) {
    const children = new Map();
    for (const p of processes) {
        if (p.ppid === p.pid) continue;
        // Appending to the local list: copying it per child was quadratic (launchd has ~400 children).
        const list = children.get(p.ppid);
        if (list) list.push(p.pid);
        else children.set(p.ppid, [p.pid]);
    }
    return children;
}

/** All pids in the subtree rooted at `rootPid` (root included). Guards against cycles. */
function collectSubtree(rootPid, children) {
    const seen = new Set();
    const stack = [rootPid];
    while (stack.length) {
        const pid = stack.pop();
        if (seen.has(pid)) continue;
        seen.add(pid);
        stack.push(...(children.get(pid) || []));
    }
    return seen;
}

/**
 * Resource link (BUILD_PLAN §8.5): each managed process's usage summed over its process tree.
 * @param {SampledProcess[]} processes
 * @param {{ id: string, pid: number|null }[]} managed
 */
function linkManaged(processes, managed) {
    if (!managed.some((m) => m.pid !== null)) return { byPid: new Map(), resources: new Map() };
    const byPidProcess = new Map(processes.map((p) => [p.pid, p]));
    const children = indexChildren(processes);
    const byPid = new Map();
    const resources = new Map();
    for (const { id, pid } of managed) {
        if (pid === null || !byPidProcess.has(pid)) continue;
        let cpu = 0;
        let memMB = 0;
        const members = collectSubtree(pid, children);
        for (const member of members) {
            const p = byPidProcess.get(member);
            if (!p) continue;
            cpu += p.cpu;
            memMB += p.memMB;
            byPid.set(member, id);
        }
        const round1 = (n) => Math.round(n * 10) / 10;
        resources.set(id, { cpu: round1(cpu), memMB: round1(memMB), procCount: members.size });
    }
    return { byPid, resources };
}

/** Pids to show in the tree: matches plus all their ancestors. */
function visibleWithAncestors(processes, query) {
    const byPid = new Map(processes.map((p) => [p.pid, p]));
    const visible = new Set();
    for (const p of processes) {
        if (!matchesQuery(p, query)) continue;
        let cursor = p;
        while (cursor && !visible.has(cursor.pid)) {
            visible.add(cursor.pid);
            cursor = cursor.ppid !== cursor.pid ? byPid.get(cursor.ppid) : undefined;
        }
    }
    return visible;
}

/**
 * Depth-first tree rows. Siblings follow the current sort; collapsed nodes hide their subtree.
 * @returns {Array<SampledProcess & { depth: number, hasChildren: boolean, collapsed: boolean, descendantCount: number }>}
 */
function buildTree(processes, { sortBy, sortDir, filterQuery, collapsedPids }) {
    const query = filterQuery.trim().toLowerCase();
    const visible = query ? visibleWithAncestors(processes, query) : null;
    const pool = visible ? processes.filter((p) => visible.has(p.pid)) : processes;
    const sorted = [...pool].sort(comparator({ sortBy, sortDir }));
    const pids = new Set(sorted.map((p) => p.pid));
    const children = indexChildren(sorted);
    const collapsed = new Set(collapsedPids);
    const roots = sorted.filter((p) => p.ppid === p.pid || !pids.has(p.ppid));
    const byPid = new Map(sorted.map((p) => [p.pid, p]));
    const rows = [];
    const seen = new Set();
    // Subtree sizes, memoized: computing each row's subtree separately was O(n·depth).
    const sizes = new Map();
    const sizeOf = (pid, path = new Set()) => {
        if (sizes.has(pid)) return sizes.get(pid);
        if (path.has(pid)) return 0; // a cycle (pid reuse): count each process once
        path.add(pid);
        const size = 1 + (children.get(pid) || []).reduce((n, kid) => n + sizeOf(kid, path), 0);
        path.delete(pid);
        sizes.set(pid, size);
        return size;
    };

    const visit = (pid, depth) => {
        if (seen.has(pid)) return;
        seen.add(pid);
        const kids = children.get(pid) || [];
        const isCollapsed = collapsed.has(pid) && kids.length > 0;
        const descendantCount = sizeOf(pid) - 1;
        rows.push({ ...byPid.get(pid), depth, hasChildren: kids.length > 0, collapsed: isCollapsed, descendantCount });
        if (!isCollapsed) for (const kid of kids) visit(kid, depth + 1);
    };
    for (const root of roots) visit(root.pid, 0);
    return rows;
}

/**
 * The full Monitor view: tag managed members and threshold levels, then table or tree ordering.
 * @returns {{ rows: any[], resources: Map<string, { cpu: number, memMB: number, procCount: number }>, byPid: Map<number, string>, top: any[] }}
 */
function deriveProcessRows(raw, managed, ui, thresholds) {
    const { byPid, resources } = linkManaged(raw, managed);
    const tagged = raw.map((p) => ({ ...p, managedId: byPid.get(p.pid) ?? null, level: processLevel(p, thresholds) }));
    const rows = ui.monitorView === 'tree' ? buildTree(tagged, ui) : applyView(tagged, ui);
    // The Overview's "top consumers" must not change because of a Monitor filter or sort.
    const top = topBy(tagged, TOP_CONSUMERS, comparator({ sortBy: 'cpu', sortDir: 'desc' }));
    return { rows, resources, byPid, top };
}

module.exports = {
    applyView,
    comparator,
    topBy,
    reconcileSelection,
    thresholdLevel,
    processLevel,
    indexChildren,
    collectSubtree,
    linkManaged,
    buildTree,
    deriveProcessRows,
    SORT_FIELDS,
};
