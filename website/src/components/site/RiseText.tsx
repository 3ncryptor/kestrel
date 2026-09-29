'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ElementType } from 'react';

const STAGGER_S = 0.06;

/** Words that rise into place one after another (static under reduced motion). */
export function RiseText({ text, as: Tag = 'span', className, delay = 0 }: { text: string; as?: ElementType; className?: string; delay?: number }) {
    const reduced = useReducedMotion();
    const words = text.split(' ');
    return (
        <Tag className={className} aria-label={text}>
            {words.map((word, i) => (
                <motion.span
                    // biome-ignore lint/suspicious/noArrayIndexKey: the words of a fixed sentence
                    key={i}
                    aria-hidden="true"
                    className="inline-block whitespace-pre"
                    initial={reduced ? false : { opacity: 0, y: '0.45em', filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: delay + i * STAGGER_S, ease: [0.16, 1, 0.3, 1] }}
                >
                    {i < words.length - 1 ? `${word} ` : word}
                </motion.span>
            ))}
        </Tag>
    );
}
