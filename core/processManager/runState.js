// Run state (PRD P12): `.kestrel/run.json` lists the children Kestrel started, so that after a hard
// crash (SIGKILL) the next start can find processes left behind and offer to stop them.
const nodeFs = require('node:fs');
const path = require('node:path');

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
// `ps` reports start times with one-second resolution; allow some slack when matching.
const START_TOLERANCE_MS = 3000;

/** @typedef {{ id: string, pid: number, pgid: number, startedAt: number }} RunChild */

/** @param {{ path: string, pid?: number, fs?: any }} options */
function createRunState({ path: file, pid = process.pid, fs = nodeFs }) {
    return {
        /** @param {RunChild[]} children */
        record(children) {
            if (!children.length) {
                fs.rmSync(file, { force: true });
                return;
            }
            fs.mkdirSync(path.dirname(file), { recursive: true, mode: DIR_MODE });
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify({ kestrelPid: pid, children }), { mode: FILE_MODE });
            fs.renameSync(tmp, file); // atomic replace: never a half-written file
        },
        /** @returns {{ kestrelPid: number, children: RunChild[] } | null} */
        readPrevious() {
            try {
                const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
                return data && Array.isArray(data.children) ? data : null;
            } catch {
                return null;
            }
        },
        clear() {
            fs.rmSync(file, { force: true });
        },
    };
}

/**
 * Children from a previous run that are still alive. A child only counts when its current start time
 * matches the recorded one, so an unrelated process that reused the pid is never treated as ours.
 * @param {{ kestrelPid: number, children: RunChild[] } | null} previous
 * @param {{ currentPid: number, startedAtOf: (pid: number) => number|null, toleranceMs?: number }} deps
 */
function findOrphans(previous, { currentPid, startedAtOf, toleranceMs = START_TOLERANCE_MS }) {
    if (!previous || previous.kestrelPid === currentPid) return [];
    return previous.children.filter((c) => {
        const started = startedAtOf(c.pid);
        return started !== null && Math.abs(started - c.startedAt) <= toleranceMs;
    });
}

module.exports = { createRunState, findOrphans };
