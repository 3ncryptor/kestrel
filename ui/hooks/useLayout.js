import { useTerminalDimensions } from '@opentui/react';
import { breakpoint } from '../logic/layout.js';

/** Terminal size plus the UI_SPEC §4.2 breakpoint. */
export function useLayout() {
    const { width, height } = useTerminalDimensions();
    return { width, height, bp: breakpoint(width, height) };
}
