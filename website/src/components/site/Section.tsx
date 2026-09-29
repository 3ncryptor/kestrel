import type { ReactNode } from 'react';
import { LineReveal, Scramble } from '@/components/motion/Reveal';
import { cn } from '@/lib/cn';

/** A landing-page section: a small pill bar, an eyebrow and a title, centred; at most one sentence of lead. */
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
    title: string;
    lead?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className={cn('relative py-24 sm:py-32', className)}>
            <div className="mx-auto max-w-6xl px-6">
                <div className="flex flex-col items-center text-center">
                    <span aria-hidden="true" className="h-1 w-16 rounded-full bg-white/70" />
                    <p className="mt-8 text-white/50 text-xs uppercase tracking-[0.32em]">{eyebrow}</p>
                    <h2 id={`${id}-title`} className="mt-4 max-w-3xl text-balance font-bold text-3xl text-k-text tracking-[-0.025em] sm:text-4xl">
                        <Scramble text={title} />
                    </h2>
                    {lead && <LineReveal className="mt-5 max-w-2xl text-balance text-k-subtext text-lg leading-relaxed">{lead}</LineReveal>}
                </div>
                <div className="mt-16">{children}</div>
            </div>
        </section>
    );
}
