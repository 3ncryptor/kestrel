// The process manager: owns one Supervisor per managed process and publishes their state to the store.
// Lifecycle logic for a single process lives in supervisor.js; this file adds naming, the per-id
// operation queue, run-state bookkeeping and whole-manager shutdown.
const { spawn } = require('node:child_process');
const { computeDelay: defaultComputeDelay } = require('./backoff');
const { Supervisor } = require('./supervisor');
const { createRunState } = require('./runState');
const { deriveId, signalGroup } = require('./groups');
const { isValidName } = require('../names');

// A process that stays up this long is healthy again: its crash streak resets.
const STABLE_RUN_MS = 30000;
// Default time between the stop signal and SIGKILL for ad-hoc processes.
const KILL_GRACE_MS = 5000;
// "exit" can arrive before the last stdout/stderr chunks; we finalize on "close" (streams drained),
// but give up waiting after this long in case a background grandchild keeps the pipe open.
const STDIO_DRAIN_MS = 1000;
const READINESS_INTERVAL_MS = 500;
// New log lines only change an entry's logCount: publish those in batches, so a process printing
// thousands of lines a second costs a few store commits (and renders) a second, not thousands.
const LOG_PUBLISH_MS = 250;
const AD_HOC_MAX_RESTARTS = 10;

const noRuntime = (id) => new Error(`No managed process named "${id}"`);

/**
 * @typedef {Object} ManagerOptions
 * @property {any} store
 * @property {typeof spawn} [spawnFn]
 * @property {(attempt: number) => number} [computeDelay]
 * @property {number} [stableRunMs]
 * @property {number} [killGraceMs]      stop timeout for ad-hoc processes
 * @property {number} [stdioDrainMs]
 * @property {number} [readinessIntervalMs]
 * @property {boolean} [autoRestart]
 * @property {number} [maxLogLines]
 * @property {string|null} [logDir]      saves logs to <logDir>/<id>.log when set
 * @property {number} [logFlushMs]
 * @property {string|null} [runStatePath]  records live children for orphan detection when set
 * @property {string} [cwd]              where ad-hoc processes run
 * @property {number} [logPublishMs]     batching window for log-only updates
 */

class ProcessManager {
    /** @param {ManagerOptions} options */
    constructor({
        store,
        spawnFn = spawn,
        computeDelay = defaultComputeDelay,
        stableRunMs = STABLE_RUN_MS,
        killGraceMs = KILL_GRACE_MS,
        stdioDrainMs = STDIO_DRAIN_MS,
        readinessIntervalMs = READINESS_INTERVAL_MS,
        autoRestart = true,
        maxLogLines = undefined,
        logDir = null,
        logFlushMs = undefined,
        runStatePath = null,
        cwd = process.cwd(),
        logPublishMs = LOG_PUBLISH_MS,
    }) {
        this.store = store;
        this.logPublishMs = logPublishMs;
        /** @type {Set<string>} ids whose logCount changed since the last batch */
        this.logsDirty = new Set();
        /** @type {NodeJS.Timeout|undefined} */
        this.logTimer = undefined;
        this.cwd = cwd; // where ad-hoc processes run unless given a cwd
        this.killGraceMs = killGraceMs;
        this.shared = { spawnFn, computeDelay, stableRunMs, stdioDrainMs, readinessIntervalMs, autoRestart, maxLogLines, logDir, logFlushMs };
        this.runState = runStatePath ? createRunState({ path: runStatePath }) : null;
        /** @type {Map<string, { sup: Supervisor, opQueue: Promise<any> }>} */
        this.runtime = new Map();
    }

    // ---------- registration ----------

    /** Adds a configured process as idle (nothing is started). @returns the store entry */
    register(def) {
        if (!isValidName(def.name)) throw new Error(`Invalid name "${def.name}" (use letters, digits, . _ -)`);
        if (this.runtime.has(def.name)) throw new Error(`A managed process named "${def.name}" already exists`);
        const id = def.name;
        const sup = new Supervisor(def, this.contextFor(id));
        this.runtime.set(id, { sup, opQueue: Promise.resolve() });
        this.store.upsertManaged({
            id,
            cmd: def.cmd,
            cwd: def.cwd,
            status: 'idle',
            restart: def.restart,
            dependsOn: def.dependsOn || [],
            ready: sup.readyInfo(false),
        });
        return this.store.getManaged(id);
    }

    /** Ad-hoc process (`n` in the UI): registered and started at once. */
    spawnManaged(cmd, { id = undefined, cwd = undefined, env = undefined } = {}) {
        if (typeof cmd !== 'string' || !cmd.trim()) throw new Error('Command must be a non-empty string');
        const name = id ? String(id).trim() : this.uniqueId(deriveId(cmd));
        this.register({
            name,
            cmd: cmd.trim(),
            cwd: cwd || this.cwd,
            env: env || {},
            envFile: null,
            dependsOn: [],
            ready: null,
            restart: 'on-failure',
            maxRestarts: AD_HOC_MAX_RESTARTS,
            stopSignal: 'SIGTERM',
            stopTimeoutMs: this.killGraceMs,
        });
        this.get(name).start();
        return this.store.getManaged(name);
    }

    has(id) {
        return this.runtime.has(id);
    }

    definitionOf(id) {
        return this.get(id).def;
    }

    definitions() {
        return [...this.runtime.values()].map(({ sup }) => sup.def);
    }

    list() {
        return [...this.runtime.keys()].map((id) => this.store.getManaged(id));
    }

    // ---------- lifecycle (serialized per id, see `enqueue`) ----------

    start(id) {
        return this.enqueue(id, (sup) => {
            sup.start();
            return this.store.getManaged(id);
        });
    }

    killManaged(id) {
        return this.enqueue(id, (sup) => sup.stop());
    }

    restartManaged(id) {
        return this.enqueue(id, async (sup) => {
            await sup.stop();
            sup.start();
            return this.store.getManaged(id);
        });
    }

    removeManaged(id) {
        return this.enqueue(id, async (sup) => {
            await sup.stop();
            if (sup.logFile) sup.logFile.close();
            const from = this.store.getManaged(id)?.status;
            this.runtime.delete(id);
            this.store.removeManaged(id);
            this.recordRunState();
            // Anyone waiting on this process (the orchestrator) learns that it is gone.
            this.store.emit('managed:status', { id, from, to: 'removed' });
        });
    }

    /** Marks an idle process as waiting on failed dependencies (set by the orchestrator). */
    block(id, deps) {
        const sup = this.get(id);
        if (!sup.running) sup.block(deps);
    }

    getLogs(id, options = {}) {
        return this.get(id).logs.query(options);
    }

    /** The variables the stack adds (envFile + inline), not the inherited environment. */
    getEnv(id) {
        return { ...this.get(id).ownEnv };
    }

    async shutdown() {
        await Promise.all([...this.runtime.keys()].map((id) => this.killManaged(id).catch(() => {})));
        clearTimeout(this.logTimer);
        this.flushLogCounts();
        for (const { sup } of this.runtime.values()) if (sup.logFile) sup.logFile.close();
        if (this.runState) this.runState.clear();
    }

    /** Best-effort synchronous cleanup for `process.on('exit')`, where async work cannot run. */
    shutdownSync() {
        for (const { sup } of this.runtime.values()) sup.shutdownSync();
    }

    // ---------- internals ----------

    get(id) {
        const rt = this.runtime.get(id);
        if (!rt) throw noRuntime(id);
        return rt.sup;
    }

    // Overlapping stop/restart/remove calls on one id run one after another, so they never launch
    // duplicate children or act on a removed entry.
    enqueue(id, op) {
        const rt = this.runtime.get(id);
        if (!rt) return Promise.reject(noRuntime(id));
        const run = rt.opQueue.then(() => {
            if (this.runtime.get(id) !== rt) throw noRuntime(id);
            return op(rt.sup);
        });
        rt.opQueue = run.catch(() => {}); // a failed op must not block later ones
        return run;
    }

    contextFor(id) {
        return {
            ...this.shared,
            publish: (patch) => this.publish(id, patch),
            entry: () => this.store.getManaged(id),
            emit: (event, payload) => this.store.emit(event, payload),
            alert: (alert) => this.store.addAlert(alert),
            dismissAlert: (alertId) => this.store.dismissAlert(alertId),
            onChildrenChanged: () => this.recordRunState(),
        };
    }

    /** Writes the entry to the store and emits `managed:status` when the status changes. */
    publish(id, patch) {
        const rt = this.runtime.get(id);
        if (!rt) return;
        if (!Object.keys(patch).length) {
            this.markLogsDirty(id);
            return;
        }
        this.logsDirty.delete(id); // this update carries the current count
        const previous = this.store.getManaged(id);
        this.store.upsertManaged({ id, ...patch, logCount: rt.sup.logs.count() });
        if (patch.status && previous && previous.status !== patch.status) {
            this.store.emit('managed:status', { id, from: previous.status, to: patch.status });
        }
    }

    markLogsDirty(id) {
        this.logsDirty.add(id);
        if (this.logTimer) return;
        this.logTimer = setTimeout(() => this.flushLogCounts(), this.logPublishMs);
        this.logTimer.unref();
    }

    flushLogCounts() {
        this.logTimer = undefined;
        const ids = [...this.logsDirty];
        this.logsDirty.clear();
        for (const id of ids) {
            const rt = this.runtime.get(id);
            if (rt) this.store.upsertManaged({ id, logCount: rt.sup.logs.count() });
        }
    }

    recordRunState() {
        if (!this.runState) return;
        const children = [...this.runtime.values()]
            .filter(({ sup }) => sup.child && sup.child.pid !== undefined)
            .map(({ sup }) => ({ id: sup.id, pid: sup.child.pid, pgid: sup.pgid ?? sup.child.pid, startedAt: sup.startedAt }));
        try {
            this.runState.record(children);
        } catch (err) {
            this.store.addAlert({ id: 'runstate', level: 'warn', source: 'kestrel', message: `Could not save run state (${err.message})` });
        }
    }

    uniqueId(base) {
        if (!this.runtime.has(base)) return base;
        let n = 2;
        while (this.runtime.has(`${base}-${n}`)) n += 1;
        return `${base}-${n}`;
    }
}

module.exports = { ProcessManager, deriveId, signalGroup, STABLE_RUN_MS, KILL_GRACE_MS, STDIO_DRAIN_MS };
