'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionGate } from '@/components/motion/useMotionGate';
import { cn } from '@/lib/cn';
import { filledRows, type HeroGrid as Grid, graphRowLevel, heroGrid, initialSeries, type Level, nextSample, seeded } from '@/lib/wordmark';

/** One cell's pitch in viewBox units, and the cell inside it (the rest is the gap). */
const PITCH = 10;
const CELL = 8.8;
const RADIUS = 1.4;
/** The word fills in left to right like a meter: this much delay per column. */
const COLUMN_DELAY_MS = 24;
/** Kestrel samples once a second, and so does the graph. */
const TICK_MS = 1000;

const WIDE = heroGrid(['KESTREL'], 7);
const NARROW = heroGrid(['KES', 'TREL'], 6);

const FILL: Record<Level, string> = {
    low: 'var(--k-green)',
    mid: 'var(--k-yellow)',
    high: 'var(--k-peach)',
    max: 'var(--k-red)',
};

function Cells({ grid, series, className }: { grid: Grid; series: readonly number[]; className: string }) {
    const lit = new Map(grid.word.map((c) => [`${c.col},${c.row}`, c.level]));
    const { top, height, left, width } = grid.graph;
    const rects = [];
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const word = lit.get(`${col},${row}`);
            const inGraph = row >= top && row < top + height && col >= left && col < left + width;
            const sample = inGraph ? (series[col - left] ?? 0) : 0;
            const bar = inGraph && row >= top + height - filledRows(sample, height);
            // The graph's empty slots repaint instantly; only the track around it keeps the pointer trail.
            let className = inGraph ? 'wm-slot' : 'wm-empty';
            let style: { fill?: string; animationDelay?: string } | undefined;
            if (word) {
                className = 'wm-lit';
                style = { fill: FILL[word], animationDelay: `${col * COLUMN_DELAY_MS}ms` };
            } else if (bar) {
                className = 'wm-bar';
                style = { fill: FILL[graphRowLevel(row - top, height)] };
            }
            rects.push(<rect key={`${col}-${row}`} x={col * PITCH} y={row * PITCH} width={CELL} height={CELL} rx={RADIUS} className={className} style={style} />);
        }
    }
    return (
        <svg viewBox={`0 0 ${grid.cols * PITCH} ${grid.rows * PITCH}`} className={cn('h-full w-full', className)} aria-hidden="true" focusable="false">
            {rects}
        </svg>
    );
}

/**
 * The hero: KESTREL in meter cells above a CPU history graph drawn in the same cells, which scrolls left once a
 * second like the real one. The first frame is deterministic (server and client agree); it only moves while on
 * screen, in a visible tab, with motion allowed. Decoration: the caller provides the text.
 */
export function HeroGrid({ className }: { className?: string }) {
    const { motion } = useMotionGate();
    const [series, setSeries] = useState(() => initialSeries(WIDE.graph.width));
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!motion || !el) return;
        let visible = true;
        const observer = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
        });
        observer.observe(el);
        const random = seeded(Date.now());
        const id = window.setInterval(() => {
            if (!visible || document.hidden) return;
            setSeries((s) => [...s.slice(1), nextSample(s.at(-1) ?? 30, random)]);
        }, TICK_MS);
        return () => {
            window.clearInterval(id);
            observer.disconnect();
        };
    }, [motion]);

    return (
        <span ref={ref} className={cn('block', className)}>
            <Cells grid={WIDE} series={series} className="hidden sm:block" />
            <Cells grid={NARROW} series={series.slice(-NARROW.graph.width)} className="sm:hidden" />
        </span>
    );
}
