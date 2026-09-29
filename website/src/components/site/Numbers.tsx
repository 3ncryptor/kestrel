'use client';

import { useInView } from 'motion/react';
import { useRef } from 'react';
import { AnimatedCounter } from '@/components/ui/animated-counter';

// The measured figures (docs/BUILD_PLAN.md §11): the full dashboard on a Mac.
const NUMBERS = [
    { value: 1, label: 'binary to install', note: 'the Bun runtime and the UI inside' },
    { value: 4, label: 'platforms', note: 'macOS and Linux, arm64 and x64' },
    { value: 0, label: 'install scripts', note: 'nothing runs during npm install' },
    { value: 3, prefix: '~', suffix: '%', label: 'of one core', note: 'measured, full dashboard' },
    { value: 80, prefix: '~', suffix: ' MB', label: 'of memory', note: 'measured, full dashboard' },
] as const;

export function Numbers() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: '-15% 0px' });
    return (
        <div ref={ref} className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-5">
            {NUMBERS.map((n) => (
                <div key={n.label} className="bg-k-base p-6">
                    <p className="font-mono font-semibold text-3xl text-k-text tabular-nums">
                        <AnimatedCounter value={inView ? n.value : 0} prefix={'prefix' in n ? n.prefix : undefined} suffix={'suffix' in n ? n.suffix : undefined} />
                    </p>
                    <p className="mt-2 text-k-text text-sm">{n.label}</p>
                    <p className="mt-1 text-k-muted text-xs">{n.note}</p>
                </div>
            ))}
        </div>
    );
}
