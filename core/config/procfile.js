// Procfile support (foreman/overmind/Heroku format): one `name: command` per line.

const LINE_PATTERN = /^([A-Za-z0-9._-]+):\s*(.+)$/;

/**
 * @param {string} text
 * @returns {{ processes: Record<string, { cmd: string }>, warnings: { line: number, message: string }[] }}
 */
function parseProcfile(text) {
    /** @type {Record<string, { cmd: string }>} */
    const processes = {};
    const warnings = [];
    text.split(/\r?\n/).forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const match = LINE_PATTERN.exec(line);
        if (!match) return warnings.push({ line: index + 1, message: 'expected "name: command"' });
        const [, name, cmd] = match;
        if (name in processes) return warnings.push({ line: index + 1, message: `duplicate process "${name}" ignored` });
        processes[name] = { cmd: cmd.trim() };
        return undefined;
    });
    return { processes, warnings };
}

module.exports = { parseProcfile };
