// Dependency ordering for the stack (BUILD_PLAN §8.3). Pure.

/** @typedef {{ name: string, dependsOn: string[] }} StackNode */

/**
 * Returns the first dependency cycle as a path (e.g. ['api', 'worker', 'api']), or null.
 * @param {StackNode[]} nodes
 */
function findCycle(nodes) {
    const deps = new Map(nodes.map((n) => [n.name, n.dependsOn]));
    const state = new Map(); // name → 'visiting' | 'done'
    const trail = [];

    const visit = (name) => {
        if (state.get(name) === 'done') return null;
        if (state.get(name) === 'visiting') return [...trail.slice(trail.indexOf(name)), name];
        state.set(name, 'visiting');
        trail.push(name);
        for (const dep of deps.get(name) || []) {
            const cycle = visit(dep);
            if (cycle) return cycle;
        }
        trail.pop();
        state.set(name, 'done');
        return null;
    };

    for (const { name } of nodes) {
        const cycle = visit(name);
        if (cycle) return cycle;
    }
    return null;
}

/**
 * Kahn's algorithm in "waves": every process in a wave depends only on earlier waves, so a wave
 * can start in parallel. Declaration order is kept within a wave. Assumes the graph is acyclic.
 * @param {StackNode[]} nodes
 * @returns {string[][]}
 */
function startWaves(nodes) {
    const started = new Set();
    const waves = [];
    let remaining = nodes;
    while (remaining.length) {
        const wave = remaining.filter((n) => n.dependsOn.every((d) => started.has(d))).map((n) => n.name);
        if (!wave.length) throw new Error('startWaves called with a dependency cycle');
        for (const name of wave) started.add(name);
        waves.push(wave);
        remaining = remaining.filter((n) => !started.has(n.name));
    }
    return waves;
}

module.exports = { findCycle, startWaves };
