/** Error raised by platform adapters. `code` is stable and safe to branch on in the UI. */
class PlatformError extends Error {
    /**
     * @param {string} message
     * @param {'EUNSUPPORTED'|'ENOTOOL'|'EREAD'|'EEXEC'} code
     */
    constructor(message, code) {
        super(message);
        this.name = 'PlatformError';
        this.code = code;
    }
}

/**
 * Converts an execFile rejection into a PlatformError with a readable message.
 * @param {any} err
 * @param {string} tool
 */
function toolError(err, tool) {
    if (err && err.code === 'ENOENT') return new PlatformError(`${tool} not found on this system`, 'ENOTOOL');
    const detail = err?.message ? err.message.split('\n')[0] : String(err);
    return new PlatformError(`${tool} failed: ${detail}`, 'EEXEC');
}

module.exports = { PlatformError, toolError };
