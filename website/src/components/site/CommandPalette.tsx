'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, Keyboard, SlidersHorizontal, SquareTerminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { type SpotlightFilter, type SpotlightItem, SpotlightSearch } from '@/components/ui/spotlight-search';
import { type SearchItem, score } from '@/lib/search';

const INDEX_URL = '/search.json';
let indexRequest: Promise<SearchItem[]> | undefined;

/** The index, fetched once per visit (a static file built with the site). */
function loadIndex(): Promise<SearchItem[]> {
    indexRequest ??= fetch(INDEX_URL).then((response) => {
        if (!response.ok) throw new Error(`${INDEX_URL}: ${response.status}`);
        return response.json() as Promise<SearchItem[]>;
    });
    indexRequest.catch(() => {
        indexRequest = undefined; // a failed load can be retried by opening the search again
    });
    return indexRequest;
}

const FILTERS: SpotlightFilter[] = [
    { id: 'Docs', label: 'Docs', icon: <BookOpen className="size-[18px]" aria-hidden="true" /> },
    { id: 'Configuration', label: 'Config', icon: <SlidersHorizontal className="size-[18px]" aria-hidden="true" /> },
    { id: 'Commands', label: 'Commands', icon: <SquareTerminal className="size-[18px]" aria-hidden="true" /> },
    { id: 'Keys', label: 'Keys', icon: <Keyboard className="size-[18px]" aria-hidden="true" /> },
];

/** Below this width the bar keeps the whole row and the filter bubbles stay hidden. */
const FILTERS_MIN_WIDTH = 540;
const MAX_WIDTH = 680;
const EDGE = 32;

/** A result's destination, short: "/docs/config#readiness" → "config#readiness". */
const shortHref = (href: string) => href.replace(/^\/docs\/?/, '').replace(/^\//, '') || 'docs';

function toSpotlight(item: SearchItem, i: number): SpotlightItem {
    return {
        id: `${item.href}|${i}`,
        title: item.title,
        category: item.group === 'Changelog' ? 'Docs' : item.group,
        // A section says what it's about in its own words; a page, command or key in its context line.
        subtitle: item.excerpt || item.context,
        hint: item.group === 'Keys' ? undefined : shortHref(item.href),
        mono: item.group === 'Commands' || item.group === 'Keys',
    };
}

/** A centred, dark, hairline dialog: the `?` shortcuts list. */
export function Panel({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms_ease-out]" />
                <Dialog.Content
                    aria-describedby={undefined}
                    className="fixed top-[12vh] left-1/2 z-[70] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e10] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] outline-none data-[state=open]:animate-[palette-in_160ms_ease-out]"
                >
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * ⌘K, as on a Mac: a Spotlight bar floats over the page (DevClub UI's spotlight search, whose filter bubbles part
 * from the bar as it opens), and results appear under it. Matches titles and what each section says.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter();
    const [index, setIndex] = useState<SearchItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [width, setWidth] = useState(MAX_WIDTH);

    useEffect(() => {
        if (!open) return;
        setWidth(Math.min(MAX_WIDTH, window.innerWidth - EDGE));
        if (!index) loadIndex().then(setIndex, () => setFailed(true));
    }, [open, index]);

    const items = useMemo(() => (index ?? []).map(toSpotlight), [index]);
    const byId = useMemo(() => new Map((index ?? []).map((item, i) => [`${item.href}|${i}`, item])), [index]);

    const rank = useCallback(
        (candidates: SpotlightItem[], query: string) =>
            candidates
                .map((c) => {
                    const source = byId.get(c.id);
                    return { c, s: source ? score(source, query) : 0 };
                })
                .filter((r) => r.s > 0)
                .sort((a, b) => b.s - a.s || a.c.title.length - b.c.title.length)
                .map((r) => r.c),
        [byId],
    );

    const select = (item: SpotlightItem) => {
        onOpenChange(false);
        router.push((item.id.split('|')[0] ?? '/docs') as Parameters<typeof router.push>[0]);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[3px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
                <Dialog.Content aria-describedby={undefined} className="fixed top-[22vh] left-1/2 z-[70] -translate-x-1/2 outline-none data-[state=open]:animate-[spotlight-in_180ms_ease-out]">
                    <Dialog.Title className="sr-only">Search</Dialog.Title>
                    {failed ? (
                        <p className="rounded-full border border-white/10 bg-[#1c1c1f]/90 px-6 py-4 text-k-muted text-sm backdrop-blur-2xl">Search isn&apos;t available right now.</p>
                    ) : (
                        <SpotlightSearch
                            autoFocus
                            items={items}
                            filters={width >= FILTERS_MIN_WIDTH ? FILTERS : []}
                            rank={rank}
                            onSelect={select}
                            placeholder="Spotlight Search"
                            width={width}
                            height={width >= FILTERS_MIN_WIDTH ? 60 : 52}
                        />
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
