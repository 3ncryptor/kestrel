// Managed box and logs panel commands (M3): process control through the manager, the stack dialogs
// and log scrolling/search. Every outcome is reported as a toast; nothing here fails silently.
import { selectedManaged, isActive, parseAdHoc } from './logic/managed.js';
import { newProcessDialog, quitDialog, envDialog, pickerDialog, canSubmit } from './logic/dialog.js';
import { LOG_LIMIT } from './logic/logs.js';

const PRINTABLE = /^[\x20-\x7e]$/;
const ERRORED_ALERT = 'errored:';

function report(d, res, success) {
    d.actions.notify(res.ok ? 'ok' : 'danger', res.ok ? success : res.error);
}

const withSelected = (fn) => (d) => {
    const m = selectedManaged(d.getState());
    return m ? fn(d, m) : undefined;
};

// ---------- logs ----------

function resumeFollow(d) {
    d.actions.setLogFollow(true);
    d.dispatch({ type: 'logs/follow' });
}

function pauseAt(d, anchorTs, offset) {
    d.actions.setLogFollow(false);
    d.dispatch({ type: 'logs/anchor', anchorTs, offset });
}

/** `delta` > 0 scrolls to older lines. Scrolling past the newest line follows again. */
function scrollLogs(d, delta) {
    const view = d.logView;
    if (!view || view.newestTs === null) return;
    if (d.getState().ui.logFollow) {
        if (delta > 0) pauseAt(d, view.newestTs, delta); // the view clamps it to what exists
        return;
    }
    const current = Math.min(d.app.logs.offset, view.maxOffset);
    if (delta < 0 && current + delta < 0) return resumeFollow(d);
    pauseAt(d, d.app.logs.anchorTs, Math.min(view.maxOffset, current + delta));
}

function toggleFollow(d) {
    if (d.getState().ui.logFollow) {
        if (d.logView && d.logView.newestTs !== null) pauseAt(d, d.logView.newestTs, 0);
        return;
    }
    resumeFollow(d);
}

// ---------- processes ----------

function moveManaged(d, id) {
    const state = d.getState();
    const list = state.managed;
    if (!list.length) return;
    const current = Math.max(0, list.indexOf(selectedManaged(state)));
    const next = Math.max(0, Math.min(list.length - 1, current + (id === 'up' || id === 'k' ? -1 : 1)));
    d.actions.selectManaged(list[next].id);
    resumeFollow(d);
}

function describeStart(data) {
    const parts = [`Started ${data.started.length}`];
    if (data.failed.length) parts.push(`${data.failed.join(', ')} failed`);
    if (data.blocked.length) parts.push(`${data.blocked.length} blocked`);
    return parts.join(' · ');
}

async function startStack(d) {
    const res = await d.actions.startStack();
    if (!res.ok) return report(d, res);
    return d.actions.notify(res.data.failed.length ? 'warn' : 'ok', describeStart(res.data));
}

/** ⏎: pick scripts on a fresh package.json project, otherwise show the process in the proc table. */
function enter(d) {
    const state = d.getState();
    if (!state.managed.length && state.stack.scripts) return d.dispatch({ type: 'dialog/open', dialog: pickerDialog(state.stack.scripts) });
    const m = selectedManaged(state);
    if (!m || m.pid === null) return undefined;
    d.actions.filter('');
    d.actions.setFocus('proc');
    return d.actions.select(m.pid);
}

function openEnv(d, m) {
    const res = d.actions.revealEnv(m.id);
    if (!res.ok) return report(d, res);
    return d.dispatch({ type: 'dialog/open', dialog: envDialog(m.id, res.data) });
}

/** L: jump to the logs of a process that gave up after too many crashes (S8). */
function logsOfFailed(d) {
    const alert = d.getState().alerts.find((a) => a.id.startsWith(ERRORED_ALERT));
    if (!alert) return d.actions.notify('info', 'No process has failed');
    d.actions.setFocus('managed');
    d.actions.selectManaged(alert.id.slice(ERRORED_ALERT.length));
    return resumeFollow(d);
}

export const MANAGED_COMMANDS = {
    'managed:move': moveManaged,
    'managed:start': withSelected(async (d, m) => report(d, await d.actions.start(m.id), `Starting ${m.id}`)),
    'managed:stop': withSelected(async (d, m) => report(d, await d.actions.stop(m.id), `Stopped ${m.id}`)),
    'managed:restart': withSelected(async (d, m) => report(d, await d.actions.restart(m.id), `Restarted ${m.id}`)),
    'managed:env': withSelected(openEnv),
    'managed:save': withSelected((d, m) => {
        const res = d.actions.saveAdHoc(m.id);
        report(d, res, res.ok ? `Saved ${m.id} to ${res.data.path}` : '');
    }),
    'managed:new': (d) => d.dispatch({ type: 'dialog/open', dialog: newProcessDialog() }),
    'managed:enter': enter,
    'stack:start': startStack,
    'stack:stop': async (d) => report(d, await d.actions.stopStack(), 'Stopped the stack'),
    'logs:follow': toggleFollow,
    'logs:search': (d) => d.dispatch({ type: 'logSearch/open' }),
    'logs:scope': (d) => {
        d.dispatch({ type: 'logs/scope' });
        resumeFollow(d);
    },
    'logs:pageUp': (d) => scrollLogs(d, d.pageSize),
    'logs:pageDown': (d) => scrollLogs(d, -d.pageSize),
    'logs:top': (d) => scrollLogs(d, LOG_LIMIT),
    'logs:bottom': resumeFollow,
    'logs:failed': logsOfFailed,
};

/** q: with processes running, ask first (S12); the stop progress shows until Kestrel exits. */
export function requestQuit(d) {
    const count = d.env.managerAvailable ? d.getState().managed.filter(isActive).length : 0;
    if (!count) return d.onQuit();
    return d.dispatch({ type: 'dialog/open', dialog: quitDialog(count) });
}

function confirmQuit(d) {
    d.dispatch({ type: 'quit/start' });
    d.onQuit();
}

async function submitNew(d, dialog) {
    const parsed = parseAdHoc(dialog.typed);
    if (!parsed) return;
    d.dispatch({ type: 'dialog/close' });
    const res = d.actions.addAdHoc(parsed.name, parsed.cmd);
    report(d, res, res.ok ? `Started ${res.data.id} · w saves it to kestrel.json` : '');
}

async function submitPicker(d, dialog, save) {
    if (!canSubmit(dialog)) return;
    d.dispatch({ type: 'dialog/close' });
    const names = dialog.items.filter((it) => it.checked).map((it) => it.name);
    const res = await d.actions.adoptScripts(names, { save });
    if (!res.ok) return report(d, res);
    return d.actions.notify('ok', `${describeStart(res.data)}${save ? ' · saved to kestrel.json' : ''}`);
}

/** Keys while a stack dialog is open. */
export function handleStackDialogKey(d, id) {
    const dialog = d.app.dialog;
    const event = (e) => d.dispatch({ type: 'dialog/event', event: e });
    if (id === 'escape') return d.dispatch({ type: 'dialog/close' });
    switch (dialog.kind) {
        case 'quit':
            return id === 'y' ? confirmQuit(d) : undefined;
        case 'env':
            return id === 'r' ? event({ type: 'reveal' }) : undefined;
        case 'picker':
            if (id === 'up' || id === 'k') return event({ type: 'move', delta: -1 });
            if (id === 'down' || id === 'j') return event({ type: 'move', delta: 1 });
            if (id === ' ') return event({ type: 'toggle' });
            if (id === 'return' || id === 'w') return submitPicker(d, dialog, id === 'w');
            return undefined;
        default: // input
            if (id === 'return') return canSubmit(dialog) ? submitNew(d, dialog) : undefined;
            if (id === 'backspace') return event({ type: 'backspace' });
            if (PRINTABLE.test(id)) return event({ type: 'type', char: id });
            return undefined;
    }
}

/** S13 is answered before anything else. */
export async function handleOrphansKey(d, id) {
    if (id === 's' || id === 'y') {
        const res = await d.actions.stopOrphans();
        return report(d, res, res.ok ? `Stopped ${res.data.stopped} left-over process${res.data.stopped === 1 ? '' : 'es'}` : '');
    }
    if (id === 'escape' || id === 'n') {
        d.actions.dismissOrphans();
        return d.actions.notify('info', 'Left them running');
    }
    return id === 'q' || id === 'ctrl+c' ? requestQuit(d) : undefined;
}

export function handleLogSearchKey(d, id) {
    const query = d.getState().ui.logFilter;
    if (id === 'return') return d.dispatch({ type: 'logSearch/close' });
    if (id === 'escape') {
        d.actions.setLogFilter('');
        return d.dispatch({ type: 'logSearch/close' });
    }
    if (id === 'backspace') return d.actions.setLogFilter(query.slice(0, -1));
    if (PRINTABLE.test(id)) return d.actions.setLogFilter(query + id);
    return undefined;
}
