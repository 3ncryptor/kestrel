'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { SITE, VERSION } from '@/lib/site';

const SCROLLED_PX = 8;

const LINKS = [
    { href: '/docs', label: 'Docs' },
    { href: '/changelog', label: 'Changelog' },
] as const;

/** The wordmark: `kestrel` with a blinking block cursor, like a terminal prompt. */
export function Wordmark() {
    return (
        <span className="flex items-center font-mono font-bold text-k-text tracking-tight">
            kestrel
            <span aria-hidden="true" className="ml-1 inline-block h-[1.05em] w-[0.55em] animate-[blink_1.1s_steps(1)_infinite] bg-k-mauve" />
        </span>
    );
}

export function Nav() {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > SCROLLED_PX);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            className={cn(
                'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
                scrolled ? 'border-white/[0.06] bg-black/70 backdrop-blur-xl' : 'border-transparent bg-transparent',
            )}
        >
            <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
                <Link href="/" aria-label="Kestrel home" className="flex items-center gap-3">
                    <Wordmark />
                    <span className="hidden rounded-full border border-k-mauve/30 bg-k-mauve/10 px-2 py-0.5 font-mono text-[11px] text-k-mauve sm:inline">
                        v{VERSION} · preview
                    </span>
                </Link>
                <ul className="flex items-center gap-1 text-sm">
                    {LINKS.map((link) => (
                        <li key={link.href}>
                            <Link href={link.href} className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/[0.06] hover:text-k-text">
                                {link.label}
                            </Link>
                        </li>
                    ))}
                    <li>
                        <a href={SITE.repo} className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/[0.06] hover:text-k-text">
                            GitHub
                        </a>
                    </li>
                    <li className="hidden sm:block">
                        <a href={SITE.npm} className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/[0.06] hover:text-k-text">
                            npm
                        </a>
                    </li>
                </ul>
            </nav>
        </header>
    );
}
