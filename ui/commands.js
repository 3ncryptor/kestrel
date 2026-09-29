// Turns key presses into actions. Keymap lookup decides WHAT a key means; this module decides how
// to carry it out. Destructive commands always go through a safety dialog (UI_SPEC §6.4).
import { keyId, resolveKey } from './keymap.js';
import { dialogForTarget, canSubmit, confirmationFor, reniceValue, isStackDialog } from './logic/dialog.js';
import { visiblePorts } from './logic/layout.js';
import { MANAGED_COMMANDS, requestQuit, handleStackDialogKey, handleOrphansKey, handleLogSearchKey } from './managedCommands.js';

const SORT_ORDER = ['cpu', 'mem', 'pid', 'name', 'user'];
const PRINTABLE = /^[\x20-\x7e]$/;

/** Which keymap context is active. */
export function contextFor(state, app) {
    if (app.help) return 'help';
    if (state.ui.focus === 'ports') return 'ports';
    if (state.ui.focus === 'managed') return 'managed';
    if (app.drawerPid !== null) return 'drawer';
    return `proc.${state.ui.monitorView}`;
}

// The managed box only exists when the process manager does (not in `kestrel sm`).
const focusOrder = (env) => (env.managerAvailable ? ['proc', 'managed', 'ports'] : ['proc', 'ports']);

const targetPid = (d) => (d.app.drawerPid !== null ? d.app.drawerPid : d.getState().ui.selectedPid);

function report(d, result, success) {
    d.actions.notify(result.ok ? 'ok' : 'danger', result.ok ? success : result.error);
}

function openDialog(d, action, extra = {}) {
    const pid = extra.pid ?? targetPid(d);
    if (pid === null || pid === undefined) return;
    const classification = d.actions.classifyTarget(pid).data;
    const described = d.actions.describeProcess(pid);
    const process = described.ok ? described.data.process : { pid, name: String(pid), user: '?', managedId: null };
    const nice = described.ok ? described.data.nice ?? 0 : 0;
    d.dispatch({ type: 'dialog/open', dialog: dialogForTarget({ action, process, classification, nice, ...extra }) });
}

function openPortKill(d) {
    const ports = visiblePorts(d.getState().ports.items, d.getState().ui.filterQuery);
    const item = ports[d.app.portIndex];
    if (!item) return;
    if (item.pid === null) {
        d.actions.notify('danger', `The owner of port ${item.port} is hidden; run Kestrel with sudo to see it`);
        return;
    }
    openDialog(d, 'killPort', { pid: item.pid, port: item.port, signal: 'SIGTERM' });
}

function move(d, delta) {
    const state = d.getState();
    if (state.ui.focus === 'ports') {
        const count = visiblePorts(state.ports.items, state.ui.filterQuery).length;
        d.dispatch({ type: 'ports/move', delta, count });
        return;
    }
    d.actions.moveSelection(delta);
}

function fold(d, id) {
    const state = d.getState();
    const row = state.processes.find((p) => p.pid === state.ui.selectedPid);
    if (!row?.hasChildren) return;
    if ((id === 'left' && !row.collapsed) || (id === 'right' && row.collapsed)) d.actions.toggleCollapse(row.pid);
}

function back(d) {
    const { ui } = d.getState();
    if (d.app.drawerPid !== null) d.dispatch({ type: 'drawer/close' });
    else if (ui.focus === 'managed' && ui.logFilter) d.actions.setLogFilter('');
    else if (ui.focus !== 'proc') d.actions.setFocus('proc');
    else if (ui.filterQuery) d.actions.filter('');
    else if (ui.monitorView !== 'table') d.actions.setMonitorView('table');
}

function focusNext(d) {
    const order = focusOrder(d.env);
    const current = order.indexOf(d.getState().ui.focus);
    d.actions.setFocus(order[(current + 1) % order.length]);
}

function jumpToPortOwner(d) {
    const state = d.getState();
    const item = visiblePorts(state.ports.items, state.ui.filterQuery)[d.app.portIndex];
    if (!item || item.pid === null) return;
    d.actions.filter('');
    d.actions.setFocus('proc');
    d.actions.select(item.pid);
}

const COMMANDS = {
    'focus:next': focusNext,
    'help:open': (d) => d.dispatch({ type: 'help/open' }),
    'help:close': (d) => d.dispatch({ type: 'help/close' }),
    quit: requestQuit,
    back,
    'move:line': (d, id) => move(d, id === 'up' || id === 'k' ? -1 : 1),
    'move:pageUp': (d) => move(d, -d.pageSize),
    'move:pageDown': (d) => move(d, d.pageSize),
    'move:first': (d) => move(d, -Infinity),
    'move:last': (d) => move(d, Infinity),
    'filter:open': (d) => d.dispatch({ type: 'filter/open' }),
    'sort:next': (d) => d.actions.sortBy(SORT_ORDER[(SORT_ORDER.indexOf(d.getState().ui.sortBy) + 1) % SORT_ORDER.length]),
    'sort:reverse': (d) => d.actions.sortBy(d.getState().ui.sortBy),
    'view:tree': (d) => d.actions.setMonitorView('tree'),
    'view:table': (d) => d.actions.setMonitorView('table'),
    'tree:fold': fold,
    kill: (d) => openDialog(d, 'kill', { signal: 'SIGTERM' }),
    'kill:force': (d) => openDialog(d, 'kill', { signal: 'SIGKILL' }),
    'kill:port': openPortKill,
    renice: (d) => openDialog(d, 'renice'),
    'drawer:open': (d) => {
        const pid = d.getState().ui.selectedPid;
        if (pid !== null) d.dispatch({ type: 'drawer/open', pid });
    },
    'drawer:close': (d) => d.dispatch({ type: 'drawer/close' }),
    'ports:jump': jumpToPortOwner,
    ...MANAGED_COMMANDS,
};

async function submitDialog(d, dialog) {
    const token = confirmationFor(dialog);
    if (!token) return;
    d.dispatch({ type: 'dialog/close' });
    const label = `${dialog.name} (${dialog.pid})`;
    if (dialog.action === 'renice') {
        const value = reniceValue(dialog);
        report(d, await d.actions.renice(dialog.pid, value, token), `${label} priority set to ${value}`);
    } else if (dialog.action === 'killPort') {
        report(d, d.actions.killPort(dialog.port, token, dialog.signal), `Sent ${dialog.signal} to ${label} on port ${dialog.port}`);
    } else {
        report(d, d.actions.kill(dialog.pid, dialog.signal, token), `Sent ${dialog.signal} to ${label}`);
    }
}

/** `m` in the managed-tier dialog: stop it the clean way, without triggering a restart. */
async function stopViaManager(d, dialog) {
    d.dispatch({ type: 'dialog/close' });
    report(d, await d.actions.stop(dialog.managedId), `Stopped ${dialog.managedId} via the manager`);
}

function handleDialogKey(d, id) {
    const dialog = d.app.dialog;
    if (id === 'escape') return d.dispatch({ type: 'dialog/close' });
    if (dialog.kind === 'blocked') return id === 'return' ? d.dispatch({ type: 'dialog/close' }) : undefined;
    if (dialog.kind === 'confirm' || dialog.kind === 'managed') {
        if (id === 'y') return submitDialog(d, dialog);
        if (id === 'm' && dialog.kind === 'managed') return stopViaManager(d, dialog);
        return undefined;
    }
    if (id === 'return') return canSubmit(dialog) ? submitDialog(d, dialog) : undefined;
    if (id === 'backspace') return d.dispatch({ type: 'dialog/event', event: { type: 'backspace' } });
    if (PRINTABLE.test(id)) return d.dispatch({ type: 'dialog/event', event: { type: 'type', char: id } });
    return undefined;
}

function handleFilterKey(d, id) {
    const query = d.getState().ui.filterQuery;
    if (id === 'return') return d.dispatch({ type: 'filter/close' });
    if (id === 'escape') {
        d.actions.filter('');
        return d.dispatch({ type: 'filter/close' });
    }
    if (id === 'backspace') return d.actions.filter(query.slice(0, -1));
    if (PRINTABLE.test(id)) return d.actions.filter(query + id);
    return undefined;
}

/**
 * @param {import('@opentui/core').KeyEvent} key
 * @param {{ app: any, dispatch: Function, actions: any, getState: () => any, env: any, onQuit: Function,
 *           pageSize: number, logView?: any }} d
 */
export function handleKey(key, d) {
    const id = keyId(key);
    if (d.app.quitting) return undefined; // the stack is stopping; Kestrel exits when it is done
    if (isStackDialog(d.app.dialog)) return handleStackDialogKey(d, id);
    if (d.app.dialog) return handleDialogKey(d, id);
    if (d.getState().orphans.length) return handleOrphansKey(d, id);
    if (d.app.filtering) return handleFilterKey(d, id);
    if (d.app.logSearching) return handleLogSearchKey(d, id);
    const action = resolveKey(contextFor(d.getState(), d.app), id, d.env);
    if (action && COMMANDS[action]) return COMMANDS[action](d, id);
    return undefined;
}
