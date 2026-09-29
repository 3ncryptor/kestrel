'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MacSlider } from '@/components/ui/mac-slider';
import { MacSwitch } from '@/components/ui/mac-switch';
import { decodeAll, type Frame } from '@/lib/frames';
import { loadStandardFrames, STILLS } from '@/lib/hero-data';
import { VERSION } from '@/lib/site';
import { TerminalFrame } from './TerminalFrame';
import { TerminalWindow } from './TerminalWindow';

const TICK_MS = 1000; // Kestrel refreshes once a second; so does the replay
const NARROW_PX = 700;
const WIDTHS = ['compact', 'standard', 'wide'] as const;
type Width = (typeof WIDTHS)[number];
const SIZE: Record<Width, string> = { compact: '64×26', standard: '100×30', wide: '150×34' };

function usePageVisible(ref: React.RefObject<HTMLElement | null>) {
    const [onScreen, setOnScreen] = useState(true);
    const [tabVisible, setTabVisible] = useState(true);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false), { threshold: 0.1 });
        io.observe(el);
        const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [ref]);
    return onScreen && tabVisible;
}

/**
 * The hero dashboard: 30 real frames rendered by Kestrel, replayed at 1 Hz. Frame 1 is server-rendered, so
 * the page shows the real thing before any JavaScript runs.
 */
export function HeroPlayer({ initial }: { initial: Frame }) {
    const reduced = useReducedMotion();
    const ref = useRef<HTMLDivElement>(null);
    const visible = usePageVisible(ref);
    const [frames, setFrames] = useState<Frame[] | null>(null);
    const [index, setIndex] = useState(0);
    const [live, setLive] = useState(true);
    const [colour, setColour] = useState(true);
    const [width, setWidth] = useState<Width>('standard');

    useEffect(() => {
        if (window.matchMedia(`(max-width: ${NARROW_PX}px)`).matches) setWidth('compact');
        let cancelled = false;
        loadStandardFrames().then((data) => {
            if (!cancelled) setFrames(decodeAll(data));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const animating = Boolean(frames) && live && visible && !reduced && colour && width === 'standard';
    useEffect(() => {
        if (!animating || !frames) return;
        const timer = setInterval(() => setIndex((i) => (i + 1) % frames.length), TICK_MS);
        return () => clearInterval(timer);
    }, [animating, frames]);

    const frame = useMemo(() => {
        if (!colour) return STILLS.mono;
        if (width !== 'standard') return STILLS[width];
        return frames?.[index] ?? initial;
    }, [colour, width, frames, index, initial]);

    const status = !colour ? 'NO_COLOR mode' : width !== 'standard' ? `${width} layout` : animating ? 'live' : 'paused';

    return (
        <div ref={ref}>
            <TerminalWindow
                title={`kestrel pm — myapp — ${SIZE[width]}`}
                footer={
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-white/[0.06] border-t bg-k-mantle/60 px-4 py-3 text-xs">
                        <div className="flex items-center gap-2.5">
                            <MacSwitch size="xs" color="purple" label="Live replay" checked={live} onChange={setLive} />
                            <span aria-hidden="true">Live</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <MacSwitch size="xs" color="purple" label="Colour (off shows NO_COLOR mode)" checked={colour} onChange={setColour} />
                            <span aria-hidden="true">Colour</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span aria-hidden="true">Width</span>
                            <MacSlider
                                size="xs"
                                color="violet"
                                label="Terminal width"
                                valueText={(v) => WIDTHS[Math.round(v)] ?? 'standard'}
                                min={0}
                                max={2}
                                step={1}
                                value={WIDTHS.indexOf(width)}
                                onChange={(v) => setWidth(WIDTHS[Math.round(v)] ?? 'standard')}
                            />
                            <span className="w-16 font-mono text-k-overlay0">{width}</span>
                        </div>
                        <span className="ml-auto flex items-center gap-2 font-mono text-k-overlay0" aria-live="polite">
                            <span className={animating ? 'size-1.5 animate-pulse rounded-full bg-k-green' : 'size-1.5 rounded-full bg-k-overlay0'} />
                            {status}
                            {animating && frames ? ` · ${String(index + 1).padStart(2, '0')}/${frames.length}` : ''}
                        </span>
                    </div>
                }
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={`${width}-${colour}`}
                        initial={reduced ? false : { opacity: 0, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={reduced ? undefined : { opacity: 0, filter: 'blur(6px)' }}
                        transition={{ duration: 0.25 }}
                    >
                        <TerminalFrame frame={frame} />
                    </motion.div>
                </AnimatePresence>
            </TerminalWindow>
            <p className="mt-3 text-center font-mono text-k-overlay0 text-xs">
                Rendered by Kestrel {VERSION} from a scripted 30 seconds. Not a screenshot, not a mock-up.
            </p>
            <p className="sr-only">
                The Kestrel dashboard running a stack called myapp: CPU and memory meters, a process list, listening ports, and the logs of
                four managed processes. During the replay the worker process crashes, Kestrel shows a retry countdown, and the worker comes
                back ready.
            </p>
        </div>
    );
}
