'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const MAX_TILT_DEG = 4;
const SPRING = { stiffness: 150, damping: 18, mass: 0.6 };

/**
 * A macOS-style terminal window. On a fine pointer it tilts gently towards the cursor (a spring, never
 * more than a few degrees); with reduced motion or on touch it stays flat.
 */
export function TerminalWindow({ title, children, className, footer }: { title: string; children: ReactNode; className?: string; footer?: ReactNode }) {
    const reduced = useReducedMotion();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [MAX_TILT_DEG, -MAX_TILT_DEG]), SPRING);
    const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-MAX_TILT_DEG, MAX_TILT_DEG]), SPRING);

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (reduced || event.pointerType !== 'mouse') return;
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left) / box.width - 0.5);
        y.set((event.clientY - box.top) / box.height - 0.5);
    };
    const reset = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <div className={cn('[perspective:1600px]', className)}>
            <motion.div
                onPointerMove={onPointerMove}
                onPointerLeave={reset}
                style={reduced ? undefined : { rotateX, rotateY }}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-k-base shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_30px_80px_-20px_rgba(203,166,247,0.25),0_18px_40px_-12px_rgba(0,0,0,0.9)] will-change-transform"
            >
                <div className="flex h-9 items-center gap-2 border-white/[0.06] border-b bg-k-mantle px-4">
                    <span className="size-3 rounded-full bg-[#ff5f57]" />
                    <span className="size-3 rounded-full bg-[#febc2e]" />
                    <span className="size-3 rounded-full bg-[#28c840]" />
                    <span className="flex-1 text-center font-mono text-k-overlay0 text-xs">{title}</span>
                    <span className="w-[52px]" />
                </div>
                <div className="p-3 sm:p-4">{children}</div>
                {footer}
            </motion.div>
        </div>
    );
}
