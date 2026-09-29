'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CommandPalette, Panel } from './CommandPalette';

/** The nav's search button fires this, so the button and the ⌘K shortcut open the same dialog. */
export const OPEN_SEARCH_EVENT = 'kestrel:search';

const CHORD_MS = 900;
const SHORTCUTS = [
    { keys: ['⌘', 'K'], what: 'Search pages, sections, commands and keys' },
    { keys: ['/'], what: 'Search, too (as in Kestrel’s filter)' },
    { keys: ['?'], what: 'This list (as in Kestrel’s help)' },
    { keys: ['g', 'h'], what: 'Go home' },
    { keys: ['g', 'd'], what: 'Go to the docs' },
    { keys: ['g', 'c'], what: 'Go to the changelog' },
    { keys: ['Esc'], what: 'Close a dialog' },
] as const;
const CHORDS: Record<string, string> = { h: '/', d: '/docs', c: '/changelog' };

const typing = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

/** Site-wide keys that echo Kestrel's own: ⌘K or / to search, ? for help, g-chords to move around. */
export function SiteShortcuts() {
    const router = useRouter();
    const [search, setSearch] = useState(false);
    const [help, setHelp] = useState(false);
    const chordAt = useRef(0);

    useEffect(() => {
        const go = (href: string) => router.push(href as Parameters<typeof router.push>[0]);
        const openSearch = () => setSearch(true);
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setSearch(true);
                return;
            }
            if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === '/') {
                event.preventDefault();
                setSearch(true);
            } else if (event.key === '?') {
                setHelp(true);
            } else if (event.key === 'g') {
                chordAt.current = Date.now();
            } else if (Date.now() - chordAt.current < CHORD_MS && CHORDS[event.key]) {
                chordAt.current = 0;
                go(CHORDS[event.key] as string);
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
        };
    }, [router]);

    return (
        <>
            <CommandPalette open={search} onOpenChange={setSearch} />
            <Panel open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
                <div className="border-white/[0.06] border-b px-5 py-4">
                    <p className="font-medium text-k-text">Keyboard shortcuts</p>
                    <p className="text-k-muted text-sm">The site answers to keys, like Kestrel does.</p>
                </div>
                <ul className="space-y-3 px-5 py-4 text-sm">
                    {SHORTCUTS.map((s) => (
                        <li key={s.what} className="flex items-center justify-between gap-6">
                            <span>{s.what}</span>
                            <span className="flex gap-1">
                                {s.keys.map((k) => (
                                    <kbd key={k} className="min-w-7 rounded-md border border-white/15 px-2 py-0.5 text-center font-mono text-k-text text-xs">
                                        {k}
                                    </kbd>
                                ))}
                            </span>
                        </li>
                    ))}
                </ul>
            </Panel>
        </>
    );
}
