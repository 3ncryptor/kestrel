'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useEffect } from 'react';
import { useMotionGate } from './useMotionGate';

gsap.registerPlugin(ScrollTrigger);

/** The fixed nav's height plus a little air: where anchor jumps land. */
const NAV_OFFSET_PX = -88;

let current: Lenis | null = null;

/** Scrolls to an element or position, smoothly when Lenis runs and natively otherwise. */
export function scrollToTarget(target: HTMLElement | number) {
    if (current) {
        current.scrollTo(target, { offset: typeof target === 'number' ? 0 : NAV_OFFSET_PX });
        return;
    }
    if (typeof target === 'number') window.scrollTo({ top: target });
    else target.scrollIntoView({ block: 'start' });
}

/**
 * Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger (the pinned tour, the gallery) reads the same
 * scroll position on the same frame. Native scrolling stays in charge of everything else: keyboard, find in page,
 * and Next's own scroll on navigation all still work, because Lenis follows the native scroll position.
 */
export function SmoothScroll() {
    const { motion } = useMotionGate();

    useEffect(() => {
        if (!motion) return;
        const lenis = new Lenis({
            autoRaf: false,
            anchors: { offset: NAV_OFFSET_PX },
            stopInertiaOnNavigate: true,
            // Dialogs and marked regions scroll natively.
            prevent: (node) => Boolean(node.closest('[role="dialog"], [data-lenis-prevent]')),
        });
        current = lenis;
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (seconds: number) => lenis.raf(seconds * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        // A modal (Radix marks the body while one is open) freezes the page behind it.
        const locked = () => (document.body.hasAttribute('data-scroll-locked') ? lenis.stop() : lenis.start());
        const observer = new MutationObserver(locked);
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] });

        return () => {
            observer.disconnect();
            gsap.ticker.remove(tick);
            gsap.ticker.lagSmoothing(500, 33);
            lenis.destroy();
            current = null;
        };
    }, [motion]);

    return null;
}
