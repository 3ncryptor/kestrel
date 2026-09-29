// Composition root: wires the engine together and exposes only the UI contract (store + actions)
// plus lifecycle controls. Presentation layers import this file and nothing else from core/.
const os = require('node:os');
const path = require('node:path');
const { createPlatform } = require('./platform');
const { Store } = require('./store');
const { createSampler } = require('./sampler');
const { ProcessManager } = require('./processManager');
const { createRunState } = require('./processManager/runState');
const { createStackSession, stackDir } = require('./stack/session');
const systemControl = require('./systemControl');
const { createActions } = require('./actions');
const { version } = require('../package.json');

/** @type {import('./config').StackResult} */
const NO_STACK = Object.freeze({ source: null, path: null, config: null, errors: [], warnings: [], detected: null });

/**
 * @param {{ platform?: string, intervalMs?: number, thresholds?: import('./store/types').Thresholds,
 *           meta?: Partial<import('./store/types').Meta>, stack?: import('./config').StackResult | null,
 *           cwd?: string }} [options]
 *   `stack`: the loaded config (core/config loadStack). Its processes are registered idle; nothing starts
 *   until `actions.startStack()`. Logs and run state go to `.kestrel/` next to the config.
 */
function createKestrel({ platform: platformName, intervalMs, thresholds, meta = {}, stack = null, cwd = process.cwd() } = {}) {
    const loaded = stack || NO_STACK;
    const monitor = loaded.config ? loaded.config.monitor : null;
    const platform = createPlatform({ platform: platformName });
    const isRoot = process.getuid?.() === 0;
    const store = new Store({
        meta: {
            version, platform: platform.id, arch: process.arch, hostname: os.hostname(), isRoot, startedAt: Date.now(),
            configPath: loaded.path, configSource: loaded.source, ...meta,
        },
        thresholds: thresholds ?? monitor?.thresholds,
    });

    const dir = stackDir(loaded);
    const stateDir = dir ? path.join(dir, '.kestrel') : null;
    const runStatePath = stateDir ? path.join(stateDir, 'run.json') : null;
    // Read before anything starts: our own children overwrite this file.
    const previousRun = runStatePath ? createRunState({ path: runStatePath }).readPrevious() : null;

    const processManager = new ProcessManager({ store, cwd, logDir: stateDir ? path.join(stateDir, 'logs') : null, runStatePath });
    const session = createStackSession({ store, pm: processManager, stack: loaded, cwd, previousRun, isAlive: systemControl.isAlive });
    store.once('processes:update', () => session.checkOrphans());
    const sampler = createSampler({ platform, sink: store, intervalMs: intervalMs ?? monitor?.intervalMs });

    // Managed children run in their own process groups, so make sure they never outlive us.
    const onExit = () => processManager.shutdownSync();
    process.once('exit', onExit);

    /** Graceful: the stack stops in reverse dependency order (progress in state.stack). Idempotent. */
    let stopping = null;
    function stop() {
        stopping ??= (async () => {
            sampler.stop();
            await session.stopStack();
            await processManager.shutdown();
            session.dispose();
            process.removeListener('exit', onExit);
        })();
        return stopping;
    }

    const actions = createActions({
        store,
        processManager,
        session,
        systemControl,
        sampler,
        context: { selfPid: process.pid, parentPid: process.ppid, currentUser: os.userInfo().username },
        onQuit: stop,
    });

    return { store, actions, start: () => sampler.start(), tick: () => sampler.tick(), stop };
}

module.exports = { createKestrel };
