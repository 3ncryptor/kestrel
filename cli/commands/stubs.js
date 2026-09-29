// Commands whose implementation lands in a later milestone. Each says so plainly and exits 1.

const PENDING = {
    doctor: ['M4', 'kestrel doctor'],
};

/** Returns a command handler that reports when `name` becomes available. */
function pending(name) {
    const [milestone, what] = PENDING[name];
    return (_parsed, io) => {
        io.stderr.write(`${what} arrives in milestone ${milestone}.\nAvailable now: kestrel, kestrel pm, kestrel sm, kestrel init, kestrel import pm2\n`);
        return 1;
    };
}

module.exports = { pending, PENDING };
