// The project's stack at runtime (PRD P1–P12): registers the configured processes, starts and stops
// them through the orchestrator, saves ad-hoc processes and handles children left by a previous run.
const path = require('path');
const { createOrchestrator } = require('./orchestrator');
const { findOrphans } = require('../processManager/runState');
const { groupAlive, signalPgid } = require('../processManager/groups');
const { validateConfig } = require('../config/schema');
const { scriptsToConfig } = require('../config/packageJson');
const { addProcess, writeConfigFile, toConfigEntry } = require('../config/save');

const CONFIG_FILE = 'kestrel.json';
const ORPHAN_GRACE_MS = 5000;
const ORPHAN_POLL_MS = 100;
// If no process list arrives (the sampler failing), orphans cannot be verified: stop waiting for it.
const ORPHAN_CHECK_TIMEOUT_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function signalPid(pid, signal) {
    try {
        process.kill(pid, signal);
    } catch {
        // Already gone.
    }
}

/** The folder a stack lives in (its config's folder), or null when there is no stack. */
const stackDir = (stack) => (stack && stack.path ? path.dirname(stack.path) : null);

/**
 * @param {{ store: any, pm: any, stack: import('../config').StackResult, cwd: string,
 *           previousRun: { kestrelPid: number, children: any[] } | null, isAlive: (pid: number) => boolean }} deps
 */
function createStackSession({ store, pm, stack, cwd, previousRun, isAlive }) {
    const dir = stackDir(stack) || cwd;
    const orchestrator = createOrchestrator({ pm, store, names: [] });
    const startedAtOf = (pid) => store.findProcess(pid)?.startedAt ?? null;

    // Starting waits until left-over children are answered (S13): a new db would otherwise race the
    // old one for its port. Opens at once without a previous run, after the check, or on its timeout.
    /** @type {() => void} */
    let openGate = () => {};
    const gate = new Promise((resolve) => (openGate = () => resolve(undefined)));
    const gateTimer = previousRun ? setTimeout(() => openGate(), ORPHAN_CHECK_TIMEOUT_MS) : undefined;
    if (gateTimer) gateTimer.unref();
    else openGate();

    function registerAll(config) {
        for (const def of config.processes) {
            pm.register(def);
            orchestrator.adopt(def.name);
        }
    }

    store.setStack({
        name: stack.source ? path.basename(dir) : null,
        source: stack.source,
        path: stack.path,
        errors: stack.errors,
        warnings: stack.warnings,
        scripts: stack.detected ? stack.detected.scripts : null,
    });
    if (stack.config) registerAll(stack.config);

    async function startStack(options = {}) {
        if (!orchestrator.names.length) {
            throw new Error(stack.errors.length
                ? 'The config has problems; fix them and start Kestrel again'
                : 'No stack here · run kestrel init, or press n to add a process');
        }
        const previous = store.getState().stack.phase;
        store.setStack({ phase: 'starting', stopProgress: {} });
        try {
            await gate;
            const result = await orchestrator.startStack(options);
            if (orchestrator.active) store.setStack({ phase: 'running' });
            return result;
        } catch (err) {
            store.setStack({ phase: previous });
            throw err;
        }
    }

    async function stopStack() {
        store.setStack({ phase: 'stopping', stopProgress: {} });
        await orchestrator.stopStack({
            onProgress: (id, phase) => store.setStack({ stopProgress: { ...store.getState().stack.stopProgress, [id]: phase } }),
        });
        store.setStack({ phase: 'stopped' });
    }

    /** First run on a package.json project: start the scripts the user picked, optionally saving them. */
    function adoptScripts(names, { save = false } = {}) {
        const { scripts } = store.getState().stack;
        if (!scripts || !stack.detected) throw new Error('There are no package.json scripts to pick from');
        if (!Array.isArray(names) || !names.length) throw new Error('Pick at least one script');
        const unknown = names.find((n) => !scripts.some((s) => s.name === n));
        if (unknown) throw new Error(`package.json has no script "${unknown}"`);

        const raw = scriptsToConfig(stack.detected.runner, names);
        const { config, errors } = validateConfig(raw, { baseDir: dir });
        if (errors.length) throw new Error(errors.map((e) => `${e.path} ${e.message}`).join('; '));
        if (save) {
            const file = path.join(dir, CONFIG_FILE);
            writeConfigFile(file, raw);
            store.setStack({ source: 'kestrel.json', path: file });
            store.setMeta({ configSource: 'kestrel.json', configPath: file });
        }
        store.setStack({ scripts: null });
        registerAll(config);
        return startStack();
    }

    /** Adds an ad-hoc process to kestrel.json (created when the project has no config yet). */
    function saveAdHoc(id) {
        const { source, path: file } = store.getState().stack;
        if (source && source !== 'kestrel.json') {
            throw new Error(`This stack comes from ${source}; run kestrel init to create kestrel.json, then save to it`);
        }
        const target = file || path.join(dir, CONFIG_FILE);
        addProcess(target, id, toConfigEntry(pm.definitionOf(id), path.dirname(target)));
        orchestrator.adopt(id);
        store.setStack({ source: 'kestrel.json', path: target, name: path.basename(path.dirname(target)) });
        store.setMeta({ configSource: 'kestrel.json', configPath: target });
        return { path: target };
    }

    /** Runs once the first process list is in: only then can start times be compared. */
    function checkOrphans() {
        if (!previousRun) return;
        clearTimeout(gateTimer);
        if (isAlive(previousRun.kestrelPid)) {
            openGate();
            store.addAlert({
                id: 'another-kestrel',
                level: 'warn',
                source: 'kestrel',
                message: `Another Kestrel (pid ${previousRun.kestrelPid}) is managing this stack`,
            });
            return;
        }
        const orphans = findOrphans(previousRun, { currentPid: process.pid, startedAtOf });
        store.setOrphans(orphans);
        if (!orphans.length) openGate();
    }

    /** Stops the orphans that are still the same processes (checked again now), SIGTERM then SIGKILL. */
    async function stopOrphans() {
        const orphans = findOrphans({ kestrelPid: -1, children: store.getState().orphans }, { currentPid: process.pid, startedAtOf });
        // Only a verified group leader has its whole group signalled.
        const signal = (o, sig) => (o.pgid === o.pid ? signalPgid(o.pgid, sig) : signalPid(o.pid, sig));
        const alive = (o) => (o.pgid === o.pid ? groupAlive(o.pgid) : isAlive(o.pid));
        orphans.forEach((o) => signal(o, 'SIGTERM'));
        const deadline = Date.now() + ORPHAN_GRACE_MS;
        while (orphans.some(alive) && Date.now() < deadline) await sleep(ORPHAN_POLL_MS);
        orphans.filter(alive).forEach((o) => signal(o, 'SIGKILL'));
        forgetOrphans();
        return { stopped: orphans.length };
    }

    /** Leaves them running and stops asking: the run state now lists only our own children. */
    function forgetOrphans() {
        store.setOrphans([]);
        pm.recordRunState();
        openGate();
    }

    return {
        startStack,
        stopStack,
        adoptScripts,
        saveAdHoc,
        checkOrphans,
        stopOrphans,
        dismissOrphans: forgetOrphans,
        dispose: () => {
            clearTimeout(gateTimer);
            orchestrator.dispose();
        },
    };
}

module.exports = { createStackSession, stackDir };
