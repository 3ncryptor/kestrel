// Managed box logic (UI_SPEC §6.5): what each status says, and how much room the box needs. Pure.
import { formatDuration } from './format.js';

const MAX_ERROR_LINES = 3;
const AD_HOC = /^([A-Za-z0-9._-]{1,64}):\s+(.+)$/;

const seconds = (ms) => Math.max(0, Math.ceil(ms / 1000));
const exitText = (m) => (m.signal ? m.signal : `exit ${m.exitCode}`);

/** `:3000` for a port or an http URL, '' for a log line. */
function readyTarget(ready) {
    if (ready.kind === 'port') return `:${ready.target}`;
    if (ready.kind === 'http') {
        try {
            const url = new URL(ready.target);
            return `:${url.port || (url.protocol === 'https:' ? 443 : 80)}`;
        } catch {
            return '';
        }
    }
    return '';
}

/** The words next to a managed process: `ready :3000`, `retry 3 in 4s`, `blocked by db`… */
export function statusLabel(m, now) {
    switch (m.status) {
        case 'starting':
            return `starting ${formatDuration((now - m.startedAt) / 1000)}`;
        case 'running':
            if (m.ready?.ok) return `ready ${readyTarget(m.ready)}`.trim();
            return `up ${formatDuration((now - m.startedAt) / 1000)}`;
        case 'unready':
            return `not ready ${m.ready ? readyTarget(m.ready) : ''}`.trim();
        case 'restarting':
            return m.nextRestartAt ? `retry ${m.restartCount} in ${seconds(m.nextRestartAt - now)}s` : `retry ${m.restartCount}`;
        case 'crashed':
            return `crashed (${exitText(m)})`;
        case 'errored':
            return m.exitCode === null && !m.signal ? 'errored' : `errored (${exitText(m)})`;
        case 'blocked':
            return `blocked by ${m.blockedBy.join(', ')}`;
        case 'stopping':
            return 'stopping…';
        case 'stopped':
            return 'stopped';
        case 'exited':
            return `exited (${exitText(m)})`;
        default:
            return 'idle';
    }
}

/** "3/4": running processes out of all of them. */
export const readySummary = (managed) => `${managed.filter((m) => m.status === 'running').length}/${managed.length}`;

/** Has (or is about to have) a live process: quitting has to stop it. */
export const isActive = (m) => m.pid !== null || m.status === 'restarting' || m.status === 'starting';

/** "web: npm run dev" → { name: 'web', cmd }; anything else is just a command (the name is derived). */
export function parseAdHoc(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const match = AD_HOC.exec(trimmed);
    return match ? { name: match[1], cmd: match[2].trim() } : { name: undefined, cmd: trimmed };
}

/** Content rows the managed box needs: one per process, or its empty/error message. */
export function managedRows({ managed, stack }) {
    if (managed.length) return managed.length;
    if (stack.errors.length) return Math.min(stack.errors.length, MAX_ERROR_LINES) + 1;
    return 2;
}

/** The selected managed entry (the first one until the user picks). */
export const selectedManaged = (state) => state.managed.find((m) => m.id === state.ui.selectedManagedId) ?? state.managed[0] ?? null;
