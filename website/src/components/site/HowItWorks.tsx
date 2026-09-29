'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { RotateCcw } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { scrollToTarget } from '@/components/motion/SmoothScroll';
import { useMotionGate } from '@/components/motion/useMotionGate';
import cli from '@/generated/cli.json';
import { cn } from '@/lib/cn';
import { decodeAll, type Frame } from '@/lib/frames';
import { CRASH_FROM, CRASH_TO, loadStandardFrames } from '@/lib/hero-data';
import { InstallCommand } from './InstallCommand';
import { TerminalFrame } from './TerminalFrame';
import { TerminalWindow } from './TerminalWindow';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Kestrel refreshes once a second; so does the replay. */
const TICK_MS = 1000;
/** Scroll distance per step while the section is pinned, in % of the viewport. */
const PIN_STEP_PCT = 70;

const STEPS = [
    { id: 'install', label: 'Install', window: 'zsh — ~', caption: 'One command. The npm package is a single binary, and no install scripts run.' },
    { id: 'init', label: 'Describe your stack', window: 'zsh — ~/myapp', caption: 'kestrel init turns a Procfile or your package.json scripts into kestrel.json.' },
    { id: 'run', label: 'Run it', window: 'kestrel pm — myapp — 100×30', caption: 'Your processes and the whole machine, on one screen, refreshed every second.' },
    { id: 'recover', label: 'Crash & recover', window: 'kestrel pm — myapp — 100×30', caption: 'The worker crashes. Kestrel restarts it with backoff, and its log says why.' },
] as const;

function Prompt({ cwd, children }: { cwd: string; children: ReactNode }) {
    return (
        <p className="text-k-text">
            <span className="text-k-mauve">{cwd}</span> <span className="text-k-green">$</span> {children}
        </p>
    );
}

function Shell({ children }: { children: ReactNode }) {
    return <div className="flex h-full flex-col gap-4 font-mono text-[13px] leading-relaxed sm:text-sm">{children}</div>;
}

/** The frames of the replay, loaded once the section is close to the viewport. */
function useReplay(root: React.RefObject<HTMLElement | null>) {
    const [frames, setFrames] = useState<Frame[] | null>(null);
    useEffect(() => {
        const el = root.current;
        if (!el) return;
        let cancelled = false;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                observer.disconnect();
                loadStandardFrames().then((data) => {
                    if (!cancelled) setFrames(decodeAll(data));
                });
            },
            { rootMargin: '100% 0px' },
        );
        observer.observe(el);
        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, [root]);
    return frames;
}

/**
 * How it works, in four steps inside one terminal: the real commands with their captured output, then the real
 * dashboard. On a desktop with motion the section pins and scrolling walks the steps; everywhere the steps are
 * tabs (arrow keys included). The dashboard only plays while this step is showing and on screen.
 */
export function HowItWorks({ initial, crashStill }: { initial: Frame; crashStill: Frame }) {
    const { motion } = useMotionGate();
    const root = useRef<HTMLElement>(null);
    const trigger = useRef<ScrollTrigger | null>(null);
    const tabs = useRef<Array<HTMLButtonElement | null>>([]);
    const id = useId();
    const [active, setActive] = useState(0);
    const [tick, setTick] = useState(0);
    const [onScreen, setOnScreen] = useState(false);
    const frames = useReplay(root);
    const step = STEPS[active] ?? STEPS[0];
    const replaying = step.id === 'run' || step.id === 'recover';

    useGSAP(
        () => {
            if (!motion) return;
            const media = gsap.matchMedia();
            media.add('(min-width: 1024px)', () => {
                trigger.current = ScrollTrigger.create({
                    trigger: root.current,
                    start: 'top top+=56',
                    end: `+=${STEPS.length * PIN_STEP_PCT}%`,
                    pin: true,
                    onUpdate: (self) => setActive(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))),
                });
                return () => {
                    trigger.current = null;
                };
            });
            return () => media.revert();
        },
        { dependencies: [motion], scope: root },
    );

    useEffect(() => {
        const el = root.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false), { threshold: 0.2 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // The replay restarts on each step: the whole 30 seconds for "Run it", the crash and its recovery for the last.
    // (Adjusting state while rendering, as React recommends, rather than in an effect.)
    const [shown, setShown] = useState(active);
    if (shown !== active) {
        setShown(active);
        setTick(0);
    }
    const playing = motion && replaying && onScreen && Boolean(frames);
    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            if (!document.hidden) setTick((t) => t + 1);
        }, TICK_MS);
        return () => window.clearInterval(timer);
    }, [playing]);

    const select = (index: number) => {
        const pinned = trigger.current;
        if (pinned) scrollToTarget(pinned.start + ((index + 0.5) / STEPS.length) * (pinned.end - pinned.start));
        else setActive(index);
    };

    const onKeyDown = (event: KeyboardEvent) => {
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!delta) return;
        event.preventDefault();
        const next = (active + delta + STEPS.length) % STEPS.length;
        select(next);
        tabs.current[next]?.focus();
    };

    let frame = initial;
    if (step.id === 'run') frame = motion && frames ? (frames[tick % frames.length] ?? initial) : initial;
    if (step.id === 'recover') {
        const span = CRASH_TO - CRASH_FROM + 1;
        frame = motion && frames ? (frames[CRASH_FROM + (tick % span)] ?? crashStill) : crashStill;
    }

    return (
        <section ref={root} id="how-it-works" aria-labelledby={`${id}-title`} className="px-4 py-16 sm:px-6 lg:min-h-[calc(100svh-56px)] lg:py-8">
            <h2 id={`${id}-title`} className="sr-only">
                How it works
            </h2>
            {/* The pinned view must fit one screen: the terminal's width follows the viewport's height. */}
            <div className="mx-auto max-w-5xl lg:max-w-[min(64rem,calc((100svh-21rem)*1.66))]">
                <div role="tablist" aria-label="How it works" onKeyDown={onKeyDown} className="-mx-4 flex gap-8 overflow-x-auto px-4 pb-1 sm:justify-center">
                    {STEPS.map((s, i) => (
                        <button
                            key={s.id}
                            ref={(el) => {
                                tabs.current[i] = el;
                            }}
                            type="button"
                            role="tab"
                            id={`${id}-tab-${s.id}`}
                            aria-selected={i === active}
                            aria-controls={`${id}-panel`}
                            tabIndex={i === active ? 0 : -1}
                            onClick={() => select(i)}
                            className={cn(
                                'flex shrink-0 items-baseline gap-2 border-b-2 pb-3 text-[15px] transition-colors',
                                i === active ? 'border-white text-k-text' : 'border-transparent text-k-muted hover:text-k-subtext',
                            )}
                        >
                            <span className="font-mono text-xs tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                            {s.label}
                        </button>
                    ))}
                </div>

                <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${step.id}`} className="mt-8">
                    <TerminalWindow title={step.window}>
                        <div className="sm:aspect-[1.66]">
                            {step.id === 'install' && (
                                <Shell>
                                    <InstallCommand className="max-w-none" />
                                    <div>
                                        <Prompt cwd="~">kestrel --version</Prompt>
                                        <p className="text-k-subtext">{cli.version}</p>
                                    </div>
                                </Shell>
                            )}
                            {step.id === 'init' && (
                                <Shell>
                                    <div>
                                        <Prompt cwd="~/myapp">cat Procfile</Prompt>
                                        <pre className="whitespace-pre-wrap text-k-subtext">{cli.procfile}</pre>
                                    </div>
                                    <div>
                                        <Prompt cwd="~/myapp">kestrel init</Prompt>
                                        <pre className="whitespace-pre-wrap text-k-subtext">{cli.init}</pre>
                                    </div>
                                </Shell>
                            )}
                            {replaying && <TerminalFrame frame={frame} />}
                        </div>
                    </TerminalWindow>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
                        <p className="text-balance text-k-subtext">{step.caption}</p>
                        {step.id === 'recover' && motion && (
                            <button
                                type="button"
                                onClick={() => setTick(0)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-k-text text-xs transition-colors hover:border-white/30"
                            >
                                <RotateCcw aria-hidden="true" className="size-3" />
                                Crash it again
                            </button>
                        )}
                    </div>
                    {replaying && (
                        <p className="sr-only">
                            {step.id === 'run'
                                ? 'The Kestrel dashboard running a stack called myapp: CPU and memory meters, the managed processes, listening ports, and all of their logs.'
                                : 'The worker process crashes; Kestrel logs the exit code, shows a retry countdown, restarts it, and the worker comes back ready.'}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
