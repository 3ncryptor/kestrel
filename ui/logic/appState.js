// UI-only state (overlays, focus). Everything the engine needs lives in the core store instead.
import { dialogReducer } from './dialog.js';

export const INITIAL_APP_STATE = Object.freeze({
    help: false,
    filtering: false,
    dialog: null,
    drawerPid: null,
    portIndex: 0,
    // Logs panel (M3): `scope` one process or all; paused views are anchored (ui/logic/logs.js).
    logs: Object.freeze({ scope: 'one', anchorTs: null, offset: 0 }),
    logSearching: false,
    quitting: false,
    pickerOffered: false,
});

const clamp = (value, count) => Math.max(0, Math.min(Math.max(0, count - 1), value));

export function appReducer(state, action) {
    switch (action.type) {
        case 'help/open':
            return { ...state, help: true };
        case 'help/close':
            return { ...state, help: false };
        case 'filter/open':
            return { ...state, filtering: true };
        case 'filter/close':
            return { ...state, filtering: false };
        case 'dialog/open':
            return { ...state, dialog: action.dialog };
        case 'dialog/event':
            return { ...state, dialog: dialogReducer(state.dialog, action.event) };
        case 'dialog/close':
            return { ...state, dialog: null };
        case 'drawer/open':
            return { ...state, drawerPid: action.pid };
        case 'drawer/close':
            return { ...state, drawerPid: null };
        case 'logs/scope':
            return { ...state, logs: { ...state.logs, scope: state.logs.scope === 'one' ? 'all' : 'one' } };
        case 'logs/anchor':
            return { ...state, logs: { ...state.logs, anchorTs: action.anchorTs, offset: Math.max(0, action.offset) } };
        case 'logs/follow':
            return { ...state, logs: { ...state.logs, anchorTs: null, offset: 0 } };
        case 'logSearch/open':
            return { ...state, logSearching: true };
        case 'logSearch/close':
            return { ...state, logSearching: false };
        case 'quit/start':
            return { ...state, quitting: true, dialog: null };
        case 'picker/offered':
            return { ...state, pickerOffered: true };
        case 'ports/move':
            return { ...state, portIndex: clamp(state.portIndex + action.delta, action.count) };
        default:
            return state;
    }
}
