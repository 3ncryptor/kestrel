import type { ReactNode } from 'react';
import { LineReveal, Scramble } from '@/components/motion/Reveal';
import { HorizontalScale } from '@/components/ui/scales';
import { cn } from '@/lib/cn';

/** A landing-page section: a ruler line, an eyebrow, a title and a lead, then the content. */
export function Section({
    id,
    eyebrow,
    title,
    lead,
    children,
    className,
}: {
    id: string;
    eyebrow: string;
    title: ReactNode;
    lead?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className={cn('relative py-24 sm:py-32', className)}>
            <div className="mx-auto max-w-6xl px-6">
                <HorizontalScale className="mb-14 opacity-60" />
                <p className="font-mono text-k-teal text-xs uppercase tracking-[0.2em]">{eyebrow}</p>
                <h2 id={`${id}-title`} className="mt-4 max-w-3xl text-balance font-semibold text-3xl text-k-text tracking-tight sm:text-4xl">
                    {typeof title === 'string' ? <Scramble text={title} /> : title}
                </h2>
                {lead && <LineReveal className="mt-5 max-w-2xl text-balance text-lg leading-relaxed">{lead}</LineReveal>}
                <div className="mt-14">{children}</div>
            </div>
        </section>
    );
}
