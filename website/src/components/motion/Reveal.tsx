'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { type ElementType, type ReactNode, useRef } from 'react';
import { useMotionGate } from './useMotionGate';

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrambleTextPlugin, SplitText);

/** The glyphs a title decodes through: Kestrel's own meter and braille-graph characters. */
const SCRAMBLE_CHARS = '░▒▓█▁▂▃▄▅▆▇⣀⣤⣶⣿';
const ENTER = 'top 85%';

/**
 * Text that decodes into place like a terminal repainting, once, as it scrolls into view. The final text is in the
 * markup from the start (no layout shift, no flash, fine without JavaScript), and assistive tech reads only that.
 */
export function Scramble({ text, className }: { text: string; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const { motion } = useMotionGate();

    useGSAP(
        () => {
            if (!motion || !ref.current) return;
            gsap.to(ref.current, {
                duration: 1.1,
                ease: 'none',
                scrambleText: { text, chars: SCRAMBLE_CHARS, revealDelay: 0.2, speed: 0.5 },
                scrollTrigger: { trigger: ref.current, start: ENTER, once: true },
            });
        },
        { dependencies: [motion, text] },
    );

    return (
        <>
            <span className="sr-only">{text}</span>
            <span ref={ref} aria-hidden="true" className={className}>
                {text}
            </span>
        </>
    );
}

/** A paragraph whose lines rise out of a mask, one after another, as it scrolls into view. */
export function LineReveal({ as: Tag = 'p', className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
    const ref = useRef<HTMLElement>(null);
    const { motion } = useMotionGate();

    useGSAP(
        () => {
            if (!motion || !ref.current) return;
            const el = ref.current;
            SplitText.create(el, {
                type: 'lines',
                mask: 'lines',
                // Lines keep whole words in the DOM, so screen readers read them as normal text. ('auto' would put
                // an aria-label on the paragraph, which ARIA prohibits.)
                aria: 'none',
                autoSplit: true,
                onSplit: (split) =>
                    gsap.from(split.lines, {
                        yPercent: 110,
                        duration: 0.8,
                        ease: 'expo.out',
                        stagger: 0.08,
                        scrollTrigger: { trigger: el, start: ENTER, once: true },
                    }),
            });
        },
        { dependencies: [motion] },
    );

    return (
        <Tag ref={ref} className={className}>
            {children}
        </Tag>
    );
}
