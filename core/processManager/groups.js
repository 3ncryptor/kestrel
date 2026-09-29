// Process-group helpers. Every managed child leads its own group (`detached: true`), so signalling
// `-pgid` reaches everything it spawned.
const path = require('node:path');

/** "node scripts/dummy-worker.js" → "dummy-worker": prefers the script over the interpreter. */
function deriveId(cmd) {
    const tokens = cmd.trim().split(/\s+/);
    const fileToken = tokens.find((t) => !t.startsWith('-') && /[/.]/.test(t)) || tokens[0];
    const base = path.basename(fileToken, path.extname(fileToken)).replace(/[^A-Za-z0-9._-]/g, '');
    return base || 'proc';
}

/** Signals the child's whole process group, falling back to the child alone. */
function signalGroup(child, signal) {
    try {
        process.kill(-child.pid, signal);
    } catch {
        try {
            child.kill(signal);
        } catch {
            // Already gone: nothing to signal.
        }
    }
}

/** True while any process in group `pgid` is still alive (signal 0 delivers nothing). */
function groupAlive(pgid) {
    try {
        process.kill(-pgid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

function signalPgid(pgid, signal) {
    try {
        process.kill(-pgid, signal);
    } catch {
        // Group already gone.
    }
}

module.exports = { deriveId, signalGroup, groupAlive, signalPgid };
