// Signals and priority changes for arbitrary processes. Callers must pass the safety policy first
// (see policy.js); this module only validates arguments and translates OS errors into plain words.
const os = require('node:os');

const ALLOWED_SIGNALS = Object.freeze(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGSTOP', 'SIGCONT']);
const MIN_PRIORITY = -20;
const MAX_PRIORITY = 20;
// pid 0 targets our own process group and pid 1 is init/launchd; neither is ever a valid target.
const MIN_TARGET_PID = 2;

class SystemControlError extends Error {
    /** @param {string} message @param {string} code */
    constructor(message, code) {
        super(message);
        this.name = 'SystemControlError';
        this.code = code;
    }
}

function assertValidPid(pid) {
    if (!Number.isInteger(pid) || pid < MIN_TARGET_PID) {
        throw new SystemControlError(`Invalid pid "${pid}"`, 'EINVAL');
    }
    if (pid === process.pid) throw new SystemControlError('Refusing to signal Kestrel itself', 'ESELF');
}

function translateKillError(err, pid) {
    if (err.code === 'ESRCH') return new SystemControlError(`Process ${pid} no longer exists`, 'ESRCH');
    if (err.code === 'EPERM') {
        return new SystemControlError(`Permission denied for process ${pid} (owned by another user? try sudo)`, 'EPERM');
    }
    return new SystemControlError(err.message, err.code || 'EUNKNOWN');
}

/** Sends `signal` (default SIGTERM) to one process. */
function killByPid(pid, signal = 'SIGTERM') {
    assertValidPid(pid);
    if (!ALLOWED_SIGNALS.includes(signal)) throw new SystemControlError(`Signal "${signal}" is not allowed`, 'EINVAL');
    try {
        process.kill(pid, signal);
    } catch (err) {
        throw translateKillError(err, pid);
    }
}

/** Liveness probe: signal 0 checks existence without delivering anything. */
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM'; // exists, but owned by someone else
    }
}

/** os.setPriority raises a SystemError whose real errno name is in `info.code`. */
function translateReniceError(err, pid) {
    const code = err?.info?.code || err?.code;
    if (code === 'EACCES' || code === 'EPERM') {
        return new SystemControlError(`Permission denied: raising the priority of ${pid} needs sudo`, 'EPERM');
    }
    if (code === 'ESRCH') return new SystemControlError(`Process ${pid} no longer exists`, 'ESRCH');
    return new SystemControlError(`Could not change priority: ${err?.message}`, 'ERENICE');
}

/**
 * Sets the absolute nice value (-20 highest priority … 20 lowest). Lowering it usually needs root.
 * Uses the setpriority(2) syscall via os.setPriority, so no `renice` binary is needed (minimal
 * server images such as Amazon Linux 2023 don't ship one).
 */
async function renice(pid, priority) {
    assertValidPid(pid);
    if (!Number.isInteger(priority) || priority < MIN_PRIORITY || priority > MAX_PRIORITY) {
        throw new SystemControlError(`Priority must be a whole number from ${MIN_PRIORITY} to ${MAX_PRIORITY}`, 'EINVAL');
    }
    try {
        os.setPriority(pid, priority);
    } catch (err) {
        throw translateReniceError(err, pid);
    }
}

/** Current nice value, or null when the process is gone or not readable. */
function getNice(pid) {
    try {
        return os.getPriority(pid);
    } catch {
        return null;
    }
}

module.exports = {
    killByPid,
    renice,
    getNice,
    isAlive,
    translateKillError,
    translateReniceError,
    SystemControlError,
    ALLOWED_SIGNALS,
    MIN_PRIORITY,
    MAX_PRIORITY,
};
