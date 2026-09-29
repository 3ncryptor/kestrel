// The app shell: banner lines, the btop-style dashboard, and overlays (help, dialogs). Talks to the
// core only through `store` (read) and `actions` (write).
import { useEffect, useReducer, useRef } from 'react';
import { useKeyboard } from '@opentui/react';
import { useStore, useToastTimer } from './hooks/useStore.js';
import { useLayout } from './hooks/useLayout.js';
import { useTheme } from './theme/context.js';
import { appReducer, INITIAL_APP_STATE } from './logic/appState.js';
import { isStackDialog, pickerDialog } from './logic/dialog.js';
import { selectedManaged } from './logic/managed.js';
import { logView as computeLogView } from './logic/logs.js';
import { handleKey, contextFor } from './commands.js';
import { footerFor, helpFor } from './keymap.js';
import { Banners, TooSmall, bannerCount } from './components/chrome.jsx';
import { Dialog, HelpOverlay } from './components/overlays.jsx';
import { StackDialog, OrphansPanel, StoppingPanel } from './components/stackOverlays.jsx';
import { Dashboard, procPageSize, logRows } from './screens/Dashboard.jsx';

/** What the logs panel shows (only computed while it is on screen). */
function logsFor(state, app, actions, rows) {
    const entry = selectedManaged(state);
    const ids = app.logs.scope === 'all' ? state.managed.map((m) => m.id) : entry ? [entry.id] : [];
    return computeLogView({
        getLogs: actions.getLogs,
        ids,
        filter: state.ui.logFilter,
        follow: state.ui.logFollow,
        anchorTs: app.logs.anchorTs,
        offset: app.logs.offset,
        rows,
    });
}

/** A fresh package.json project in `kestrel pm`: offer the script picker once (UI_SPEC §6.6). */
function usePickerOffer(state, app, dispatch, env) {
    const shouldOffer = env.managerAvailable && !app.pickerOffered && Boolean(state.stack.scripts)
        && !state.managed.length && state.ui.focus === 'managed' && !app.dialog;
    useEffect(() => {
        if (!shouldOffer) return;
        dispatch({ type: 'picker/offered' });
        dispatch({ type: 'dialog/open', dialog: pickerDialog(state.stack.scripts) });
    }, [shouldOffer, dispatch, state.stack.scripts]);
}

function Overlay({ state, app, env, width, height }) {
    if (app.quitting) return <StoppingPanel progress={state.stack.stopProgress} width={width} height={height} />;
    if (isStackDialog(app.dialog)) return <StackDialog dialog={app.dialog} width={width} height={height} />;
    if (app.dialog) return <Dialog dialog={app.dialog} width={width} height={height} />;
    if (state.orphans.length) return <OrphansPanel orphans={state.orphans} width={width} height={height} />;
    if (app.help) return <HelpOverlay groups={helpFor(contextFor(state, { ...app, help: false }), env)} width={width} height={height} />;
    return null;
}

/**
 * @param {{ store: any, actions: any, env: { managerAvailable: boolean }, onQuit: () => void, coalesceMs?: number }} props
 */
export function App({ store, actions, env, onQuit, coalesceMs = 0 }) {
    const state = useStore(store, coalesceMs);
    const theme = useTheme();
    const { width, height, bp } = useLayout();
    const [app, dispatch] = useReducer(appReducer, INITIAL_APP_STATE);
    useToastTimer(state.ui.toast, actions);
    usePickerOffer(state, app, dispatch, env);

    const banners = bannerCount(state.errors, state.alerts);
    const bodyHeight = Math.max(1, height - banners);
    const cores = state.system.cores.length;
    const showLogs = env.managerAvailable && state.ui.focus === 'managed';
    const logView = showLogs ? logsFor(state, app, actions, logRows(bodyHeight, bp, cores)) : null;
    const latest = useRef(null);
    latest.current = {
        app, dispatch, actions, env, onQuit, logView,
        getState: () => store.getState(),
        pageSize: procPageSize(bodyHeight, bp, cores),
    };
    useKeyboard((key) => handleKey(key, latest.current));

    if (bp === 'tooSmall') return <TooSmall width={width} height={height} />;
    const drawer = app.drawerPid !== null ? actions.describeProcess(app.drawerPid) : null;
    const procContext = app.drawerPid !== null ? 'drawer' : `proc.${state.ui.monitorView}`;
    const hints = {
        proc: footerFor(procContext, env),
        managed: footerFor('managed', env),
        logs: footerFor('managed', env, 'logs'),
        ports: footerFor('ports', env),
    };

    return (
        <box flexDirection="column" width={width} height={height} backgroundColor={theme.bg.app}>
            <Banners errors={state.errors} alerts={state.alerts} />
            <Dashboard
                state={state}
                app={app}
                env={env}
                width={width}
                height={bodyHeight}
                bp={bp}
                hints={hints}
                drawerInfo={drawer?.ok ? drawer.data : null}
                logView={logView}
            />
            <Overlay state={state} app={app} env={env} width={width} height={height} />
        </box>
    );
}
