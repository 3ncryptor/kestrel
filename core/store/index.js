// The single source of truth shared by the engine and the UI (BUILD_PLAN §6).
// Every update replaces state objects (never mutates) and emits `change` plus a domain event.
const { EventEmitter } = require('node:events');
const { pushBounded } = require('../sampler/ring');
const { nextLeakState } = require('../sampler/leak');
const { deriveProcessRows, reconcileSelection } = require('./selectors');
const S = require('./state');

const round1 = (n) => Math.round(n * 10) / 10;

function validateUi(ui) {
    if (!S.SCREENS.includes(ui.screen)) throw new Error(`Unknown screen "${ui.screen}"`);
    if (!S.MONITOR_VIEWS.includes(ui.monitorView)) throw new Error(`Unknown monitor view "${ui.monitorView}"`);
    if (!S.FOCUS_BOXES.includes(ui.focus)) throw new Error(`Unknown focus box "${ui.focus}"`);
    if (!S.SORT_KEYS.includes(ui.sortBy)) throw new Error(`Unknown sort key "${ui.sortBy}"`);
    if (ui.sortDir !== 'asc' && ui.sortDir !== 'desc') throw new Error(`Unknown sort direction "${ui.sortDir}"`);
    if (typeof ui.filterQuery !== 'string') throw new Error('The filter must be text');
    if (typeof ui.logFilter !== 'string') throw new Error('The log filter must be text');
    if (!Array.isArray(ui.collapsedPids)) throw new Error('collapsedPids must be a list');
}

class Store extends EventEmitter {
    /** @param {{ meta?: object, thresholds?: { cpu: number[], memMB: number[] } }} [options] */
    constructor(options = {}) {
        super();
        /** @type {import('./types').KestrelState} */
        this.state = S.createInitialState(options);
        /** @type {import('../sampler/cpu').SampledProcess[]} */
        this.rawProcesses = [];
        /** @type {import('../platform/types').PortsResult} */
        this.rawPorts = { items: [], partial: false };
        /** @type {number|null} */
        this.rawPortsAt = null;
        /** @type {Map<number, string>} pid → managed id, from the latest resource link */
        this.managedByPid = new Map();
        this.leakState = new Map(); // id → { suspect, lastMatchAt } (private: not part of the contract)
    }

    getState() {
        return this.state;
    }

    commit(patch) {
        this.state = { ...this.state, ...patch };
        this.emit('change', this.state);
    }

    setMeta(meta) {
        this.commit({ meta: { ...this.state.meta, ...meta } });
    }

    setThresholds(thresholds) {
        this.state = { ...this.state, settings: { ...this.state.settings, thresholds } };
        this.refreshViews();
    }

    // ---------- samples ----------

    setSystem(system) {
        const next = { ...this.state.system, ...system };
        const { cpu, mem } = this.state.history;
        const memPercent = next.memUsedMB !== null && next.memTotalMB ? round1((next.memUsedMB / next.memTotalMB) * 100) : null;
        this.commit({
            system: next,
            history: {
                cpu: next.cpuPercent === null ? cpu : pushBounded(cpu, next.cpuPercent, S.HISTORY_CAPACITY),
                mem: memPercent === null ? mem : pushBounded(mem, memPercent, S.HISTORY_CAPACITY),
            },
        });
        this.emit('stats:update', this.state.system);
    }

    setProcesses(rawProcesses) {
        this.rawProcesses = rawProcesses;
        this.refreshViews();
        this.emit('processes:update', this.state.processes);
    }

    setPorts(ports) {
        this.rawPorts = ports;
        this.rawPortsAt = Date.now();
        this.refreshViews();
        this.emit('ports:update', this.state.ports);
    }

    /** Ports refresh every second while the ports box has focus (otherwise every 5 s). */
    prefersFastPorts() {
        return this.state.ui.focus === 'ports';
    }

    reportError(source, err) {
        this.commit({ errors: { ...this.state.errors, [source]: { message: err.message, at: Date.now() } } });
        this.emit('collector:error', { source, message: err.message });
    }

    clearError(source) {
        if (!(source in this.state.errors)) return;
        const { [source]: _removed, ...rest } = this.state.errors;
        this.commit({ errors: rest });
    }

    // ---------- UI state ----------

    updateUi(patch) {
        const merged = { ...this.state.ui, ...patch };
        validateUi(merged);
        const ui = { ...merged, filterQuery: merged.filterQuery.slice(0, S.MAX_FILTER_LENGTH) };
        this.state = { ...this.state, ui };
        this.refreshViews();
        this.emit('ui:update', this.state.ui);
    }

    setToast(level, message) {
        this.updateUi({ toast: { level, message, at: Date.now() } });
    }

    dismissToast() {
        this.updateUi({ toast: null });
    }

    // ---------- derived views ----------

    /** Recomputes processes, managed resources and port tags from the latest raw samples. */
    refreshViews() {
        const { ui, managed, settings } = this.state;
        const { rows, resources, byPid, top } = deriveProcessRows(this.rawProcesses, managed, ui, settings.thresholds);
        this.managedByPid = byPid;
        const selectedPid = reconcileSelection(rows, ui.selectedPid);
        this.commit({
            processes: rows,
            topConsumers: top,
            ui: selectedPid === ui.selectedPid ? ui : { ...ui, selectedPid },
            managed: managed.map((m) => ({ ...m, resources: resources.get(m.id) ?? null })),
            ports: {
                items: this.rawPorts.items.map((p) => ({ ...p, managedId: (p.pid !== null && byPid.get(p.pid)) || null })),
                partial: this.rawPorts.partial,
                updatedAt: this.rawPortsAt,
            },
        });
    }

    /**
     * Looks a process up in the latest sample regardless of the current filter, so safety checks
     * never depend on what happens to be visible.
     * @returns {(import('../sampler/cpu').SampledProcess & { managedId: string|null }) | null}
     */
    findProcess(pid) {
        const proc = this.rawProcesses.find((p) => p.pid === pid);
        return proc ? { ...proc, managedId: this.managedByPid.get(pid) ?? null } : null;
    }

    // ---------- managed processes ----------

    getManaged(id) {
        return this.state.managed.find((m) => m.id === id) || null;
    }

    upsertManaged(entry) {
        const current = this.getManaged(entry.id);
        const managed = current
            ? this.state.managed.map((m) => (m.id === entry.id ? { ...m, ...entry } : m))
            : [...this.state.managed, S.createManagedEntry(entry)];
        // Only a new entry or a pid change affects the process views; log-count and status updates
        // (which can arrive many times per second) just commit the managed list.
        const pidChanged = !current || ('pid' in entry && entry.pid !== current.pid);
        if (!pidChanged) {
            this.commit({ managed });
            return;
        }
        this.state = { ...this.state, managed };
        this.refreshViews();
    }

    removeManaged(id) {
        this.leakState.delete(id);
        this.state = { ...this.state, managed: this.state.managed.filter((m) => m.id !== id) };
        this.dismissAlert(`leak:${id}`);
        this.refreshViews();
    }

    /** Called by the sampler every 5 s: memory history + leak detection per managed process. */
    sampleManagedMemory(at) {
        const managed = this.state.managed.map((m) => {
            if (!m.resources) return m;
            const memHistory = pushBounded(m.memHistory, { at, value: m.resources.memMB }, S.MANAGED_MEM_CAPACITY);
            const prev = this.leakState.get(m.id) || { suspect: false, lastMatchAt: null };
            const leak = nextLeakState(prev, memHistory, at);
            this.leakState.set(m.id, leak);
            return { ...m, memHistory, leakSuspect: leak.suspect };
        });
        this.commit({ managed });
        for (const m of managed) this.syncLeakAlert(m);
    }

    syncLeakAlert(m) {
        const id = `leak:${m.id}`;
        const present = this.state.alerts.some((a) => a.id === id);
        if (m.leakSuspect && !present) {
            this.addAlert({ id, level: 'warn', source: `managed:${m.id}`, message: `${m.id} memory keeps rising (possible leak)` });
        } else if (!m.leakSuspect && present) {
            this.dismissAlert(id);
        }
    }

    // ---------- stack ----------

    setStack(patch) {
        this.commit({ stack: { ...this.state.stack, ...patch } });
    }

    setOrphans(orphans) {
        this.commit({ orphans });
    }

    // ---------- alerts ----------

    addAlert(alert) {
        if (this.state.alerts.some((a) => a.id === alert.id)) return;
        const full = { at: Date.now(), ...alert };
        this.commit({ alerts: [...this.state.alerts, full] });
        this.emit('alert', full);
    }

    dismissAlert(id) {
        if (!this.state.alerts.some((a) => a.id === id)) return;
        this.commit({ alerts: this.state.alerts.filter((a) => a.id !== id) });
    }
}

module.exports = { Store };
