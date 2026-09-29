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
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = LINE_PATTERN.exec(line);
        if (!match) {
            warnings.push({ line: index + 1, message: 'expected "name: command"' });
            continue;
        }
        const [, name, cmd] = match;
        if (name in processes) warnings.push({ line: index + 1, message: `duplicate process "${name}" ignored` });
        else processes[name] = { cmd: cmd.trim() };
    }
    return { processes, warnings };
}

module.exports = { parseProcfile };
