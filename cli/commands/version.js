const { version: VERSION } = require('../../package.json');

/** @param {any} _parsed @param {{ stdout: { write: (s: string) => void } }} io */
function version(_parsed, io) {
    io.stdout.write(`kestrel ${VERSION}\n`);
    return 0;
}

module.exports = { version };
