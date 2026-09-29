// Selects the platform adapter for the current OS. Everything above this layer is OS-agnostic.
const { PlatformError } = require('./errors');

/**
 * @param {{ platform?: string } & Record<string, any>} [options]  extra keys are passed to the adapter
 * @returns {import('./types').PlatformAdapter}
 */
function createPlatform({ platform = process.platform, ...deps } = {}) {
    if (platform === 'darwin') return require('./darwin').createDarwinAdapter(deps);
    if (platform === 'linux') return require('./linux').createLinuxAdapter(deps);
    throw new PlatformError(`Kestrel supports macOS and Linux; "${platform}" is not supported yet`, 'EUNSUPPORTED');
}

module.exports = { createPlatform, PlatformError };
