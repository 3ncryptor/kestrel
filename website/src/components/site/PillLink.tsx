import Link from 'next/link';
import type { ReactNode } from 'react';
import { Magnetic } from '@/components/motion/Magnetic';
import { cn } from '@/lib/cn';

const VARIANTS = {
    /** The one action per view: a white pill. */
    primary: 'bg-white text-black hover:bg-white/90',
    /** Everything else: a hairline ghost. */
    ghost: 'border border-white/15 text-k-text hover:border-white/30 hover:bg-white/[0.04]',
} as const;

/** A pill-shaped link. Site routes go through Next's Link; anything with a scheme is a plain anchor. */
export function PillLink({ href, variant = 'ghost', children, className }: { href: string; variant?: keyof typeof VARIANTS; children: ReactNode; className?: string }) {
    const classes = cn('inline-flex h-12 items-center gap-2.5 rounded-full px-6 font-medium text-[15px] transition-colors [&_svg]:size-4', VARIANTS[variant], className);
    const link = /^[a-z]+:/i.test(href) ? (
        <a href={href} className={classes}>
            {children}
        </a>
    ) : (
        <Link href={href as Parameters<typeof Link>[0]['href']} className={classes}>
            {children}
        </Link>
    );
    return variant === 'primary' ? <Magnetic>{link}</Magnetic> : link;
}
