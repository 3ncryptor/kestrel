import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Subscribes a component to the core store. The store replaces its state object on every change,
// so reference equality is enough for React to detect updates.
//
// One sampling tick commits several times (system, processes, ports). With `coalesceMs > 0` those
// notifications are merged into a single render — measured in M2 to cut the UI's CPU use roughly
// in half. Tests pass 0 so every change renders synchronously.
export function useStore(store, coalesceMs = 0) {
    // Stable identity: a new subscribe function would make React resubscribe on every render and
    // throw away a pending coalesced notification.
    const subscribe = useCallback(
        (onChange) => {
            let timer = null;
            const notify = coalesceMs > 0
                ? () => {
                    if (timer) return;
                    timer = setTimeout(() => {
                        timer = null;
                        onChange();
                    }, coalesceMs);
                }
                : onChange;
            store.on('change', notify);
            return () => {
                clearTimeout(timer);
                store.off('change', notify);
            };
        },
        [store, coalesceMs]
    );
    return useSyncExternalStore(subscribe, () => store.getState());
}

const TOAST_MS = { danger: 6000, default: 3000 };

/** Dismisses the current toast after its display time (UI_SPEC §8: errors 6 s, others 3 s). */
export function useToastTimer(toast, actions) {
    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => actions.dismissToast(), TOAST_MS[toast.level] ?? TOAST_MS.default);
        return () => clearTimeout(timer);
    }, [toast, actions]);
}
