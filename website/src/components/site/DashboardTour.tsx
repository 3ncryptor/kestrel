'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Frame } from '@/lib/frames';
import { TerminalFrame } from './TerminalFrame';
import { TerminalWindow } from './TerminalWindow';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const ROW_EM = 1.2; // TerminalFrame's line height

/** The regions of the 100×30 dashboard, in terminal cells (they follow Kestrel's own layout). */
const STOPS = [
    { id: 'cpu', box: { col: 0, row: 0, cols: 100, rows: 8 }, title: 'CPU, as it happens', body: 'A braille history of the whole machine, and a meter per core that turns from green to red as it fills. The load average and uptime sit in the border.' },
    { id: 'mem', box: { col: 0, row: 8, cols: 32, rows: 6 }, title: 'Memory, honestly', body: 'Used, cache, free and swap, each with its own meter, so a full cache never looks like a full machine.' },
    { id: 'managed', box: { col: 0, row: 14, cols: 32, rows: 6 }, title: 'Your stack, supervised', body: 'Every process from kestrel.json with its state: ready on its port, retrying after a crash with a countdown, or blocked by what it depends on.' },
    { id: 'logs', box: { col: 32, row: 8, cols: 68, rows: 22 }, title: 'All their logs, in one place', body: 'One process or all of them interleaved, following as they arrive. stderr is marked, Kestrel’s own lines are dimmed, and / searches.' },
    { id: 'ports', box: { col: 0, row: 20, cols: 32, rows: 10 }, title: 'Who owns that port', body: 'Every listening TCP port with its process. The ◆ badge means one of yours: :3000 is ◆api, not just “node”.' },
] as const;

function Spotlight({ index }: { index: number }) {
    const { box } = STOPS[index] ?? STOPS[0];
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-[4px] outline outline-2 outline-k-mauve transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
                left: `${box.col}ch`,
                top: `${box.row * ROW_EM}em`,
                width: `${box.cols}ch`,
                height: `${box.rows * ROW_EM}em`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 40px rgba(203, 166, 247, 0.35)',
            }}
        />
    );
}

/**
 * A guided tour of the real dashboard: the frame stays pinned while you scroll, and each step lights up
 * one part of it. Without scroll-linked motion (reduced motion, small screens) the steps are buttons.
 */
export function DashboardTour({ frame }: { frame: Frame }) {
    const reduced = useReducedMotion();
    const root = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(0);

    useGSAP(
        () => {
            if (reduced) return;
            const media = gsap.matchMedia();
            media.add('(min-width: 1024px)', () => {
                ScrollTrigger.create({
                    trigger: root.current,
                    start: 'top top+=88',
                    end: `+=${STOPS.length * 70}%`,
                    pin: true,
                    scrub: true,
                    onUpdate: (self) => setActive(Math.min(STOPS.length - 1, Math.floor(self.progress * STOPS.length))),
                });
            });
            return () => media.revert();
        },
        { scope: root, dependencies: [reduced] },
    );

    return (
        <div ref={root} className="grid items-center gap-10 lg:grid-cols-[1.55fr_1fr]">
            <TerminalWindow title="kestrel pm — myapp — 100×30">
                <div className="overflow-hidden">
                    <TerminalFrame frame={frame} overlay={<Spotlight index={active} />} />
                </div>
            </TerminalWindow>
            <ol className="space-y-2">
                {STOPS.map((stop, i) => (
                    <li key={stop.id}>
                        <button
                            type="button"
                            onClick={() => setActive(i)}
                            aria-current={i === active ? 'step' : undefined}
                            className={cn(
                                'w-full rounded-xl border px-5 py-4 text-left transition-all duration-300',
                                i === active ? 'border-k-mauve/40 bg-k-mauve/[0.07]' : 'border-transparent opacity-55 hover:opacity-90',
                            )}
                        >
                            <span className="flex items-baseline gap-3">
                                <span className="font-mono text-k-mauve text-xs">{String(i + 1).padStart(2, '0')}</span>
                                <span className="font-medium text-k-text">{stop.title}</span>
                            </span>
                            <span className={cn('mt-2 block text-sm leading-relaxed transition-[max-height,opacity] duration-300', i === active ? 'max-h-40 opacity-100' : 'max-h-0 overflow-hidden opacity-0 lg:max-h-40 lg:opacity-100')}>
                                {stop.body}
                            </span>
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}
