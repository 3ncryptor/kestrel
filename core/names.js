// Shared naming rules for managed processes (used by config validation and the process manager).
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** @param {unknown} name */
function isValidName(name) {
    return typeof name === 'string' && NAME_PATTERN.test(name);
}

module.exports = { NAME_PATTERN, isValidName };
