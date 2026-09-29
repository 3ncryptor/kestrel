'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { TocEntry } from '@/lib/docs';

/** "On this page", with the section you're reading highlighted. */
export function Toc({ entries }: { entries: TocEntry[] }) {
    const [active, setActive] = useState(entries[0]?.id);
    useEffect(() => {
        const headings = entries.map((e) => document.getElementById(e.id)).filter((el): el is HTMLElement => Boolean(el));
        const io = new IntersectionObserver(
            (seen) => {
                const visible = seen.filter((s) => s.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.id);
            },
            { rootMargin: '-80px 0px -65% 0px' },
        );
        for (const h of headings) io.observe(h);
        return () => io.disconnect();
    }, [entries]);

    if (!entries.length) return null;
    return (
        <nav aria-label="On this page">
            <p className="mb-3 font-mono text-k-muted text-xs uppercase tracking-[0.18em]">On this page</p>
            <ul className="space-y-1 border-white/[0.06] border-l text-sm">
                {entries.map((e) => (
                    <li key={e.id}>
                        <a
                            href={`#${e.id}`}
                            aria-current={active === e.id ? 'location' : undefined}
                            className={cn(
                                '-ml-px block border-l py-0.5 transition-colors',
                                e.depth === 3 ? 'pl-6' : 'pl-3',
                                active === e.id ? 'border-k-mauve text-k-mauve' : 'border-transparent hover:text-k-text',
                            )}
                        >
                            {e.text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
