'use client';

import { motion, useScroll, useTransform } from 'motion/react';

/**
 * Reading progress as one of Kestrel's own meters: segmented cells that fill left to right and shift from green
 * to yellow to peach, like a CPU meter under load. Decoration only (the scrollbar already says this).
 */
export function ScrollMeter() {
    const { scrollYProgress } = useScroll();
    const color = useTransform(scrollYProgress, [0, 0.5, 0.8, 1], ['#a6e3a1', '#a6e3a1', '#f9e2af', '#fab387']);

    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
            <motion.div
                className="h-full origin-left [mask-image:repeating-linear-gradient(90deg,#000_0_6px,transparent_6px_8px)]"
                style={{ scaleX: scrollYProgress, backgroundColor: color }}
            />
        </div>
    );
}
