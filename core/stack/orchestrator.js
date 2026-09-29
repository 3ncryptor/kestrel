// Starts and stops the configured stack in dependency order (PRD P2/P4, BUILD_PLAN §8.3).
//
// Start: wave by wave (graph.startWaves); a wave begins once every process of the previous wave is
// ready. A dependency that fails (errored, unready, crashed for good, stopped) blocks its dependents,
// and blocked processes start by themselves once the dependency recovers.
// Stop: ad-hoc processes first, then the waves in reverse order (parallel within a wave).
const { startWaves } = require('./graph');

// Statuses that satisfy a dependency, and statuses that mean it failed. Anything else is still settling.
const OK = new Set(['running', 'exited']);
const FAILED = new Set(['unready', 'errored', 'crashed', 'stopped', 'blocked', 'idle']);
const ACTIVE = new Set(['starting', 'running', 'unready', 'restarting', 'stopping']);

/**
 * @param {{ pm: any, store: any, names: string[] }} deps  `names`: the stack's processes, in config order
 */
function createOrchestrator({ pm, store, names: initialNames }) {
    let names = initialNames;
    let active = false;
    let queue = Promise.resolve();

    const statusOf = (id) => store.getManaged(id)?.status;
    // A process can be removed from the manager at any time: the stack then simply leaves it out.
    const present = () => names.filter((id) => pm.has(id));
    const depsOf = (id) => (pm.has(id) ? pm.definitionOf(id).dependsOn || [] : []);
    /** Graph nodes for `ids`, keeping only edges inside the set (a missing dependency blocks at start). */
    const nodesFor = (ids) => ids.map((id) => ({ name: id, dependsOn: depsOf(id).filter((d) => ids.includes(d)) }));

    /** Resolves 'ok' or 'failed' once `id` settles. Checks run after the current event, so a crash
     *  that is immediately followed by a restart counts as "still settling". */
    function settle(id) {
        return new Promise((resolve) => {
            let done = false;
            const check = () => {
                if (done) return;
                const status = statusOf(id);
                const outcome = OK.has(status) ? 'ok' : FAILED.has(status) || status === undefined ? 'failed' : null;
                if (!outcome) return;
                done = true;
                store.off('managed:status', onStatus);
                resolve(outcome);
            };
            const onStatus = (e) => e.id === id && setImmediate(check);
            store.on('managed:status', onStatus);
            check();
        });
    }

    /** The selection plus everything it depends on, in config order. */
    function withDependencies(only) {
        if (!only) return present();
        const wanted = new Set();
        const add = (id) => {
            if (!present().includes(id)) throw new Error(`Unknown process "${id}"`);
            if (wanted.has(id)) return;
            wanted.add(id);
            depsOf(id).forEach(add);
        };
        only.forEach(add);
        return present().filter((id) => wanted.has(id));
    }

    async function startOne(id, outcome) {
        const failedDeps = depsOf(id).filter((d) => outcome.get(d) !== 'ok');
        if (failedDeps.length) {
            pm.block(id, failedDeps);
            outcome.set(id, 'blocked');
            return;
        }
        if (!active || !pm.has(id)) {
            outcome.set(id, 'failed');
            return;
        }
        await pm.start(id);
        outcome.set(id, await settle(id));
    }

    async function runStart(only) {
        const selected = withDependencies(only);
        active = true;
        /** @type {Map<string, 'ok'|'failed'|'blocked'>} */
        const outcome = new Map();
        for (const wave of startWaves(nodesFor(selected))) {
            if (!active) break;
            await Promise.all(wave.map((id) => startOne(id, outcome)));
        }
        const having = (value) => selected.filter((id) => outcome.get(id) === value);
        return { started: having('ok'), failed: having('failed'), blocked: having('blocked') };
    }

    /** A dependency became healthy: start the processes it was blocking whose dependencies are all fine now. */
    function onRecovered(id) {
        if (!active) return;
        for (const name of names) {
            const entry = store.getManaged(name);
            if (entry?.status !== 'blocked' || !entry.blockedBy.includes(id)) continue;
            const stillFailing = depsOf(name).filter((d) => !OK.has(statusOf(d)));
            if (stillFailing.length) pm.block(name, stillFailing);
            else pm.start(name).catch(() => {});
        }
    }

    const onStatus = (e) => {
        if (OK.has(e.to)) setImmediate(() => OK.has(statusOf(e.id)) && onRecovered(e.id));
    };
    store.on('managed:status', onStatus);

    async function stopOne(id, onProgress) {
        if (!ACTIVE.has(statusOf(id))) return;
        onProgress(id, 'stopping');
        await pm.killManaged(id).catch(() => {});
        onProgress(id, 'stopped');
    }

    return {
        /** @param {{ only?: string[] }} [options] @returns {Promise<{ started: string[], failed: string[], blocked: string[] }>} */
        startStack({ only = undefined } = {}) {
            const run = queue.then(() => runStart(only));
            queue = run.then(() => {}, () => {});
            return run;
        },

        /** @param {{ onProgress?: (id: string, phase: 'stopping'|'stopped') => void }} [options] */
        async stopStack({ onProgress = () => {} } = {}) {
            active = false;
            const adHoc = pm.definitions().map((d) => d.name).filter((id) => !names.includes(id));
            const waves = startWaves(nodesFor(present())).reverse();
            for (const group of [adHoc, ...waves]) {
                await Promise.all(group.map((id) => stopOne(id, onProgress)));
            }
        },

        /** A process joins the stack (saved ad-hoc, or scripts picked in the package.json picker). */
        adopt(id) {
            if (!names.includes(id)) names = [...names, id];
        },

        get names() {
            return names;
        },

        get active() {
            return active;
        },

        dispose() {
            store.off('managed:status', onStatus);
        },
    };
}

module.exports = { createOrchestrator };
