'use client';

import { motion, useInView, useReducedMotion } from 'motion/react';
import { useRef } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;

function Card({ title, sees, misses }: { title: string; sees: string; misses: string }) {
    return (
        <div className="h-full rounded-xl border border-white/10 bg-k-mantle/70 p-6">
            <p className="font-mono text-k-overlay0 text-sm">{title}</p>
            <p className="mt-4 text-k-text">{sees}</p>
            <p className="mt-2 text-sm">
                <span className="text-k-red">✕</span> {misses}
            </p>
        </div>
    );
}

/** htop and pm2 each see half the picture; when this scrolls into view they slide together into Kestrel. */
export function MergeCards() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: '-25% 0px' });
    const reduced = useReducedMotion();
    const merged = inView || Boolean(reduced);

    return (
        <div ref={ref} className="grid items-stretch gap-4 md:grid-cols-[1fr_1.3fr_1fr]">
            <motion.div animate={merged && !reduced ? { x: 24, opacity: 0.72, scale: 0.97 } : {}} transition={{ duration: 0.9, ease: EASE }}>
                <Card title="htop · btop" sees="Sees every process on the machine." misses="Can’t tell which of them are your project." />
            </motion.div>
            <motion.div
                initial={reduced ? false : { opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                animate={merged ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : {}}
                transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
                className="relative rounded-xl border border-k-mauve/40 bg-gradient-to-b from-k-mauve/[0.12] to-k-mantle p-6 shadow-[0_0_60px_-10px_rgba(203,166,247,0.35)]"
            >
                <p className="font-mono text-k-mauve text-sm">kestrel</p>
                <p className="mt-4 text-k-text text-lg">
                    <span className="font-mono text-k-teal">◆api</span> is pid 4102, listens on <span className="font-mono">:3000</span>, holds{' '}
                    <span className="text-k-peach">1.2 GB and climbing</span>, and restarts if it crashes.
                </p>
                <ul className="mt-4 space-y-1.5 text-sm">
                    <li><span className="text-k-green">●</span> every process, with yours marked ◆</li>
                    <li><span className="text-k-green">●</span> your stack started, supervised and stopped</li>
                    <li><span className="text-k-green">●</span> CPU and memory summed over each process tree</li>
                </ul>
            </motion.div>
            <motion.div animate={merged && !reduced ? { x: -24, opacity: 0.72, scale: 0.97 } : {}} transition={{ duration: 0.9, ease: EASE }}>
                <Card title="pm2 · foreman" sees="Runs and restarts your processes." misses="Blind to the rest of the machine." />
            </motion.div>
        </div>
    );
}
