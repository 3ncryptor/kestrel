// Plain line prompts for init/import. The terminal stays in normal (cooked) mode, so this works the
// same locally, over SSH and with piped input. Answers typed ahead of a question are kept, in order.
const readline = require('node:readline');

/**
 * @typedef {Object} Prompter
 * @property {(question: string) => Promise<string|null>} ask  null once input has ended
 * @property {(question: string, defaultYes: boolean) => Promise<boolean>} confirm
 * @property {() => void} close
 */

/** @param {{ stdin: NodeJS.ReadableStream, stdout: { write: (s: string) => any } }} io @returns {Prompter} */
function createPrompter({ stdin, stdout }) {
    const rl = readline.createInterface({ input: stdin, terminal: false });
    const typed = [];
    const waiting = [];
    let ended = false;
    rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : typed.push(line)));
    rl.on('close', () => {
        ended = true;
        while (waiting.length) waiting.shift()(null);
    });

    /** @returns {Promise<string|null>} */
    function ask(question) {
        stdout.write(question);
        if (typed.length) return Promise.resolve(typed.shift());
        if (ended) return Promise.resolve(null);
        return new Promise((resolve) => waiting.push(resolve));
    }

    return {
        ask,
        async confirm(question, defaultYes) {
            const answer = await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `);
            if (answer === null || !answer.trim()) return defaultYes;
            return /^y(es)?$/i.test(answer.trim());
        },
        close: () => rl.close(),
    };
}

/** `--yes`: every question takes its default; confirmations are agreed to. @returns {Prompter} */
function createAutoPrompter({ stdout }) {
    return {
        ask: async (question) => {
            stdout.write(`${question}(default)\n`);
            return '';
        },
        confirm: async (question) => {
            stdout.write(`${question} yes (--yes)\n`);
            return true;
        },
        close: () => {},
    };
}

module.exports = { createPrompter, createAutoPrompter };
