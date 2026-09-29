'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useMotionGate } from './useMotionGate';

gsap.registerPlugin(useGSAP);

/** How far toward the pointer the content moves, as a share of the pointer's distance from its centre. */
const PULL = 0.28;

/** Content that leans toward a fine pointer and springs back when it leaves. Nothing happens on touch. */
export function Magnetic({ children, className, strength = PULL }: { children: ReactNode; className?: string; strength?: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    const { motion } = useMotionGate();

    useGSAP(
        () => {
            const el = ref.current;
            if (!motion || !el || !window.matchMedia('(pointer: fine)').matches) return;
            const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
            const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
            const move = (e: PointerEvent) => {
                const box = el.getBoundingClientRect();
                x((e.clientX - (box.left + box.width / 2)) * strength);
                y((e.clientY - (box.top + box.height / 2)) * strength);
            };
            const leave = () => {
                x(0);
                y(0);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerleave', leave);
            return () => {
                el.removeEventListener('pointermove', move);
                el.removeEventListener('pointerleave', leave);
                gsap.set(el, { x: 0, y: 0 });
            };
        },
        { dependencies: [motion, strength] },
    );

    return (
        <span ref={ref} className={cn('inline-block will-change-transform', className)}>
            {children}
        </span>
    );
}
