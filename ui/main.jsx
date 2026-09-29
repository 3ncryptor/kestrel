// Interactive entry point: creates the OpenTUI renderer and mounts the App. The terminal is always
// restored and the engine stopped, whether the user quits (q, Ctrl+C), the process gets SIGTERM or
// SIGHUP (e.g. an SSH disconnect), or rendering fails (the error is printed after the restore).
import { Component } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './App.jsx';
import { ThemeContext } from './theme/context.js';
import { detectColorDepth, resolveTheme } from './theme/capabilities.js';

// A monitor refreshing once a second needs few frames; input still renders immediately.
const TARGET_FPS = 15;
// Merge the several store commits of one sampling tick into a single render.
const COALESCE_MS = 16;

/** Any render error ends the session cleanly instead of leaving a frozen, raw-mode terminal. */
class CrashGuard extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        // Render nothing afterwards: re-rendering the same children would throw again and escape.
        return { failed: true };
    }

    componentDidCatch(error) {
        this.props.onCrash(error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

/**
 * @param {{ kestrel: any, env: { managerAvailable: boolean },
 *           colorEnv: Record<string, string|undefined>, noColor: boolean, stderr?: { write: (s: string) => any } }} options
 * @returns {Promise<number>} exit code
 */
export async function runInteractive({ kestrel, env, colorEnv, noColor, stderr = process.stderr }) {
    const theme = resolveTheme(detectColorDepth({ env: colorEnv, noColor }));
    const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: TARGET_FPS });

    return new Promise((resolve) => {
        let finished = false;
        const finish = async (code, error = null) => {
            if (finished) return;
            finished = true;
            process.off('SIGTERM', onSignal);
            process.off('SIGHUP', onSignal);
            try {
                await kestrel.stop();
            } finally {
                renderer.destroy();
                if (error) stderr.write(`kestrel: the interface crashed: ${error.message}\n`);
                resolve(code);
            }
        };
        const quit = () => finish(0);
        const onSignal = () => finish(0);
        const onCrash = (error) => finish(1, error);
        process.once('SIGTERM', onSignal);
        process.once('SIGHUP', onSignal);
        try {
            createRoot(renderer).render(
                <CrashGuard onCrash={onCrash}>
                    <ThemeContext.Provider value={theme}>
                        <App store={kestrel.store} actions={kestrel.actions} env={env} onQuit={quit} coalesceMs={COALESCE_MS} />
                    </ThemeContext.Provider>
                </CrashGuard>
            );
            kestrel.start();
        } catch (error) {
            onCrash(error);
        }
    });
}
