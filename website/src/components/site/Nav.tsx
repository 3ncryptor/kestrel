'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { VERSION } from '@/lib/site';
import { SiteMenu } from './SiteMenu';
import { OPEN_SEARCH_EVENT } from './SiteShortcuts';

const SCROLLED_PX = 8;

/** The wordmark: `kestrel` with a blinking block cursor, like a terminal prompt. */
export function Wordmark() {
    return (
        <span className="flex items-center font-mono font-bold text-k-text tracking-tight">
            kestrel
            <span aria-hidden="true" className="ml-1 inline-block h-[1.05em] w-[0.55em] animate-[blink_1.1s_steps(1)_infinite] bg-k-mauve" />
        </span>
    );
}

/** The name on the left; on the right only Search and the Menu, as pills. */
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
                    <span className="hidden rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-k-muted sm:inline">v{VERSION}</span>
                </Link>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
                        className="inline-flex h-10 items-center gap-2.5 rounded-full border border-white/15 px-4 text-k-subtext text-sm transition-colors hover:border-white/30 hover:text-k-text"
                    >
                        Search
                        <kbd className="hidden rounded border border-white/10 px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
                    </button>
                    <SiteMenu />
                </div>
            </nav>
        </header>
    );
}
