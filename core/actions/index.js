// The complete set of operations available to the UI (BUILD_PLAN §6.3). Every action returns
// `{ ok, data, error, code }` (async ones return a Promise of it) and never throws, so the UI can
// show failures as messages. Destructive actions pass the safety policy here, in the core.
const { classifyTarget, verifyConfirmation } = require('../systemControl/policy');
const { SORT_KEYS, DEFAULT_SORT_DIR } = require('../store/state');

const ok = (data = null) => ({ ok: true, data, error: null });
const fail = (err) => ({
    ok: false,
    data: null,
    error: err instanceof Error ? err.message : String(err),
    ...(err?.code ? { code: err.code } : {}),
});

function attempt(fn) {
    try {
        return ok(fn() ?? null);
    } catch (err) {
        return fail(err);
    }
}

async function attemptAsync(fn) {
    try {
        return ok((await fn()) ?? null);
    } catch (err) {
        return fail(err);
    }
}

/** A confirmation token (policy.js), plus the pid shown to the user. @typedef {{ tier: string, typedName?: string, pid?: number } | undefined} Token */

const TOAST_LEVELS = ['ok', 'info', 'warn', 'danger'];

function navigationActions(store, sampler) {
    return {
        setScreen: (screen) => attempt(() => store.updateUi({ screen })),
        setMonitorView: (monitorView) => attempt(() => store.updateUi({ monitorView })),
        // Focus moves between the dashboard's boxes; focusing ports refreshes them right away.
        setFocus: (focus) => attempt(() => {
            store.updateUi({ focus });
            if (focus === 'ports' && sampler) sampler.requestPorts();
        }),
        select: (pid) => attempt(() => store.updateUi({ selectedPid: pid })),
        moveSelection: (delta) => attempt(() => {
            const { processes, ui } = store.getState();
            if (!processes.length) return;
            const current = Math.max(0, processes.findIndex((p) => p.pid === ui.selectedPid));
            const next = Math.min(processes.length - 1, Math.max(0, current + delta));
            store.updateUi({ selectedPid: processes[next].pid });
        }),
        toggleCollapse: (pid) => attempt(() => {
            const { collapsedPids } = store.getState().ui;
            const next = collapsedPids.includes(pid) ? collapsedPids.filter((p) => p !== pid) : [...collapsedPids, pid];
            store.updateUi({ collapsedPids: next });
        }),
        selectManaged: (id) => attempt(() => store.updateUi({ selectedManagedId: id })),
    };
}

function viewActions(store) {
    return {
        // Choosing the active column again flips the direction.
        sortBy: (key) => attempt(() => {
            if (!SORT_KEYS.includes(key)) throw new Error(`Unknown sort key "${key}"`);
            const { sortBy, sortDir } = store.getState().ui;
            const nextDir = key === sortBy ? (sortDir === 'asc' ? 'desc' : 'asc') : DEFAULT_SORT_DIR[key];
            store.updateUi({ sortBy: key, sortDir: nextDir });
        }),
        filter: (query) => attempt(() => store.updateUi({ filterQuery: query })),
        setLogFilter: (query) => attempt(() => store.updateUi({ logFilter: query })),
        setLogFollow: (follow) => attempt(() => {
            if (typeof follow !== 'boolean') throw new Error('follow must be true or false');
            store.updateUi({ logFollow: follow });
        }),
        dismissToast: () => attempt(() => store.dismissToast()),
        // Shows the outcome of an action (UI_SPEC §7 S10/S11).
        notify: (level, message) => attempt(() => {
            if (!TOAST_LEVELS.includes(level)) throw new Error(`Unknown toast level "${level}"`);
            if (typeof message !== 'string') throw new Error('The message must be text');
            store.setToast(level, message);
        }),
    };
}

const MAX_PARENT_DEPTH = 32;

/** Parent chain from the root down to the direct parent. Stops at unknown pids and cycles. */
function parentChain(store, proc) {
    const chain = [];
    const seen = new Set([proc.pid]);
    let cursor = store.findProcess(proc.ppid);
    while (cursor && !seen.has(cursor.pid) && chain.length < MAX_PARENT_DEPTH) {
        seen.add(cursor.pid);
        chain.unshift({ pid: cursor.pid, name: cursor.name });
        cursor = cursor.ppid === cursor.pid ? null : store.findProcess(cursor.ppid);
    }
    return chain;
}

function systemActions(store, systemControl, context) {
    const classify = (pid) => classifyTarget({ pid, target: store.findProcess(pid), ...context });
    const guarded = (pid, confirmation) => {
        const classification = classify(pid);
        verifyConfirmation(classification, confirmation, store.findProcess(pid) || { name: '' });
    };
    const kill = (pid, signal = 'SIGTERM', /** @type {Token} */ confirmation = undefined) => attempt(() => {
        guarded(pid, confirmation);
        systemControl.killByPid(pid, signal);
    });
    return {
        classifyTarget: (pid) => attempt(() => classify(pid)),
        // Detail drawer: looks the process up regardless of the current filter.
        describeProcess: (pid) => attempt(() => {
            const proc = store.findProcess(pid);
            if (!proc) throw new Error(`Process ${pid} is no longer running`);
            return { process: proc, parents: parentChain(store, proc), nice: systemControl.getNice(pid) };
        }),
        kill,
        renice: (pid, nice, /** @type {Token} */ confirmation = undefined) => attemptAsync(async () => {
            guarded(pid, confirmation);
            await systemControl.renice(pid, nice);
        }),
        killPort: (port, /** @type {Token} */ confirmation = undefined, signal = 'SIGTERM') => {
            const listener = store.getState().ports.items.find((p) => p.port === port);
            if (!listener) return fail(new Error(`Nothing is listening on port ${port}`));
            if (listener.pid === null) return fail(new Error(`The owner of port ${port} is hidden; run Kestrel with sudo to see it`));
            // The token must name the pid the user saw: the port may have changed hands since then.
            if (!confirmation || confirmation.pid !== listener.pid) {
                return fail(Object.assign(new Error(`The process on port ${port} changed since you confirmed; open the dialog again`), { code: 'ECHANGED' }));
            }
            return kill(listener.pid, signal, confirmation);
        },
    };
}

function stackActions(processManager, session) {
    return {
        startStack: (options = {}) => attemptAsync(() => session.startStack(options)),
        stopStack: () => attemptAsync(() => session.stopStack()),
        adoptScripts: (names, options = {}) => attemptAsync(() => session.adoptScripts(names, options)),
        start: (id) => attemptAsync(() => processManager.start(id)),
        stop: (id) => attemptAsync(() => processManager.killManaged(id)),
        restart: (id) => attemptAsync(() => processManager.restartManaged(id)),
        addAdHoc: (name, cmd) => attempt(() => processManager.spawnManaged(cmd, { id: name })),
        saveAdHoc: (id) => attempt(() => session.saveAdHoc(id)),
        getLogs: (id, options = {}) => attempt(() => processManager.getLogs(id, options)),
        revealEnv: (id) => attempt(() => processManager.getEnv(id)),
        stopOrphans: () => attemptAsync(() => session.stopOrphans()),
        dismissOrphans: () => attempt(() => session.dismissOrphans()),
    };
}

/**
 * @param {{ store: import('../store').Store, processManager: any, session: any, systemControl: any,
 *           context: { selfPid: number, parentPid: number, currentUser: string },
 *           onQuit: () => Promise<void>, sampler?: { requestPorts: () => void } }} deps
 */
function createActions({ store, processManager, session, systemControl, context, onQuit, sampler }) {
    return {
        ...navigationActions(store, sampler),
        ...viewActions(store),
        ...systemActions(store, systemControl, context),
        ...stackActions(processManager, session),
        quit: () => attemptAsync(onQuit),
    };
}

const ACTION_NAMES = Object.freeze([
    'setScreen', 'setMonitorView', 'setFocus', 'select', 'moveSelection', 'toggleCollapse', 'selectManaged',
    'sortBy', 'filter', 'setLogFilter', 'setLogFollow', 'dismissToast', 'notify',
    'classifyTarget', 'describeProcess', 'kill', 'renice', 'killPort',
    'startStack', 'stopStack', 'adoptScripts', 'start', 'stop', 'restart', 'addAdHoc', 'saveAdHoc', 'getLogs', 'revealEnv',
    'stopOrphans', 'dismissOrphans',
    'quit',
]);

module.exports = { createActions, ACTION_NAMES, ok, fail };
