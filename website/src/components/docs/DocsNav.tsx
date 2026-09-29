'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export function DocsNav({ pages }: { pages: ReadonlyArray<{ href: string; title: string }> }) {
    const pathname = usePathname();
    return (
        <nav aria-label="Docs">
            <p className="mb-3 font-mono text-k-muted text-xs uppercase tracking-[0.18em]">Docs</p>
            <ul className="space-y-0.5 text-sm">
                {pages.map((page) => {
                    const active = pathname === page.href;
                    return (
                        <li key={page.href} className="relative">
                            {active && <motion.span layoutId="docs-nav-active" className="absolute inset-0 rounded-md bg-k-mauve/10" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
                            <Link
                                href={page.href as '/docs'}
                                aria-current={active ? 'page' : undefined}
                                className={cn('relative block rounded-md px-3 py-1.5 transition-colors', active ? 'text-k-mauve' : 'hover:text-k-text')}
                            >
                                {page.title}
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-6 px-3 text-k-muted text-xs leading-relaxed">
                <kbd className="rounded border border-white/10 px-1 font-mono">⌘K</kbd> search ·{' '}
                <kbd className="rounded border border-white/10 px-1 font-mono">?</kbd> shortcuts
            </p>
        </nav>
    );
}
