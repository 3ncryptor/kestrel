// Saved logs (PRD P5): `.kestrel/logs/<id>.log`, owner-only, rotated, written in small batches.
const nodeFs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_KEEP = 3;
const DEFAULT_FLUSH_MS = 250;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
// One open that creates (0600) or appends, and never follows a symlink: no check-then-write race, and
// a link planted at the log path can't redirect Kestrel's writes to another file.
const { O_WRONLY, O_APPEND, O_CREAT, O_NOFOLLOW } = nodeFs.constants;
const APPEND_FLAGS = O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW;

/** `2026-09-29T10:00:00.000Z stdout GET /health 200` */
function formatLine(line) {
    return `${new Date(line.ts).toISOString()} ${line.stream} ${line.text}\n`;
}

/**
 * @param {{ dir: string, id: string, maxBytes?: number, keep?: number, flushMs?: number, fs?: any,
 *           onError?: (err: Error) => void }} options
 */
function createLogFile({ dir, id, maxBytes = DEFAULT_MAX_BYTES, keep = DEFAULT_KEEP, flushMs = DEFAULT_FLUSH_MS, fs = nodeFs, onError = () => {} }) {
    const file = path.join(dir, `${id}.log`);
    let pending = [];
    let timer = null;
    let disabled = false;

    const size = () => {
        try {
            return fs.statSync(file).size;
        } catch {
            return 0;
        }
    };

    // file → file.1 → file.2 … ; the oldest beyond `keep` is overwritten.
    function rotate() {
        for (let i = keep; i >= 1; i--) {
            const from = i === 1 ? file : `${file}.${i - 1}`;
            if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`);
        }
    }

    function flushSync() {
        clearTimeout(timer);
        timer = null;
        if (disabled || !pending.length) return;
        const data = pending.join('');
        pending = [];
        try {
            fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
            const current = size();
            if (current > 0 && current + Buffer.byteLength(data) > maxBytes) rotate();
            const fd = fs.openSync(file, APPEND_FLAGS, FILE_MODE);
            try {
                fs.writeSync(fd, data);
            } finally {
                fs.closeSync(fd);
            }
        } catch (err) {
            // Disk full, permissions…: stop writing this file (in-memory logs continue) and report once.
            disabled = true;
            onError(err);
        }
    }

    return {
        write(line) {
            if (disabled) return;
            pending.push(formatLine(line));
            if (!timer) {
                timer = setTimeout(flushSync, flushMs);
                timer.unref?.();
            }
        },
        flushSync,
        close: flushSync,
        get disabled() {
            return disabled;
        },
        path: file,
    };
}

module.exports = { createLogFile, formatLine };
