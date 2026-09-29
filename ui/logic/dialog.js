// Safety dialog state (UI_SPEC §6.4). The core re-checks every confirmation, so this reducer only
// decides what the user sees and which token they can produce. Pure.

const MIN_NICE = -20;
const MAX_NICE = 20;
const NICE_INPUT = /^-?\d{0,2}$/;

const KIND_BY_TIER = { own: 'confirm', system: 'typeName', managed: 'managed', blocked: 'blocked' };

/**
 * @param {{ action: 'kill'|'renice'|'killPort', process: { pid: number, name: string, user: string },
 *           classification: { tier: string, reason: string }, signal?: string, nice?: number, port?: number }} input
 */
export function dialogForTarget({ action, process, classification, signal = 'SIGTERM', nice = 0, port }) {
    const base = {
        action, pid: process.pid, name: process.name, user: process.user, managedId: process.managedId ?? null,
        tier: classification.tier, reason: classification.reason, signal, port,
    };
    if (classification.tier === 'blocked') return { ...base, kind: 'blocked', typed: '' };
    if (action === 'renice') return { ...base, kind: 'renice', typed: String(nice) };
    return { ...base, kind: KIND_BY_TIER[classification.tier], typed: '' };
}

// ---------- stack dialogs (M3, UI_SPEC §6.6) ----------

const INPUT_MAX = 500;
const STACK_DIALOG_KINDS = new Set(['quit', 'input', 'env', 'picker']);

/** Dialogs of the stack (handled by ui/managedCommands.js), as opposed to the M2 safety dialogs. */
export const isStackDialog = (dialog) => Boolean(dialog && STACK_DIALOG_KINDS.has(dialog.kind));

/** `n`: a new ad-hoc process, typed as "name: command" or just a command. */
export const newProcessDialog = () => ({ kind: 'input', purpose: 'new', typed: '' });

/** S12: quitting with processes still running. */
export const quitDialog = (count) => ({ kind: 'quit', count });

/** `e`: the variables the stack adds for one process, masked until revealed. */
export const envDialog = (id, env) => ({ kind: 'env', id, vars: Object.entries(env).sort(([a], [b]) => a.localeCompare(b)), revealed: false });

/** First run on a package.json project: pick the scripts to run. */
export const pickerDialog = (scripts) => ({
    kind: 'picker',
    items: scripts.map((s) => ({ name: s.name, command: s.command, checked: s.preselected })),
    cursor: 0,
});

const clampIndex = (value, count) => Math.max(0, Math.min(count - 1, value));

function acceptsChar(dialog, char) {
    if (dialog.kind === 'renice') return NICE_INPUT.test(dialog.typed + char);
    if (dialog.kind === 'input') return dialog.typed.length < INPUT_MAX;
    return dialog.kind === 'typeName' && char.length === 1;
}

/**
 * @param {any} dialog
 * @param {{ type: 'type'|'backspace'|'cancel'|'move'|'toggle'|'reveal', char?: string, delta?: number }} event
 */
export function dialogReducer(dialog, event) {
    if (!dialog || event.type === 'cancel') return null;
    switch (event.type) {
        case 'backspace':
            return 'typed' in dialog ? { ...dialog, typed: dialog.typed.slice(0, -1) } : dialog;
        case 'type':
            return 'typed' in dialog && acceptsChar(dialog, event.char) ? { ...dialog, typed: dialog.typed + event.char } : dialog;
        case 'move':
            return dialog.kind === 'picker' ? { ...dialog, cursor: clampIndex(dialog.cursor + event.delta, dialog.items.length) } : dialog;
        case 'toggle':
            if (dialog.kind !== 'picker') return dialog;
            return { ...dialog, items: dialog.items.map((it, i) => (i === dialog.cursor ? { ...it, checked: !it.checked } : it)) };
        case 'reveal':
            return dialog.kind === 'env' ? { ...dialog, revealed: !dialog.revealed } : dialog;
        default:
            return dialog;
    }
}

export function reniceValue(dialog) {
    if (!/^-?\d{1,2}$/.test(dialog.typed)) return null;
    const value = Number(dialog.typed);
    return value >= MIN_NICE && value <= MAX_NICE ? value : null;
}

export function canSubmit(dialog) {
    if (!dialog) return false;
    if (dialog.kind === 'blocked') return false;
    if (dialog.kind === 'typeName') return dialog.typed === dialog.name;
    if (dialog.kind === 'renice') return reniceValue(dialog) !== null;
    if (dialog.kind === 'input') return dialog.typed.trim() !== '';
    if (dialog.kind === 'picker') return dialog.items.some((it) => it.checked);
    return true;
}

/** The confirmation token the core expects (core/systemControl/policy.js), or null. */
export function confirmationFor(dialog) {
    if (!canSubmit(dialog)) return null;
    // canSubmit() already guaranteed the typed text equals the process name. The pid lets the core
    // refuse if the target changed hands after the dialog opened (e.g. a port's owner restarted).
    if (dialog.tier === 'system') return { tier: 'system', typedName: dialog.typed, pid: dialog.pid };
    return { tier: dialog.tier, pid: dialog.pid };
}
