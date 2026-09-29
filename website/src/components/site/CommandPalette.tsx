'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CornerDownLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { type Result, type SearchItem, search } from '@/lib/search';

const INDEX_URL = '/search.json';
let indexRequest: Promise<SearchItem[]> | undefined;

/** The index, fetched once per visit (a static file built with the site). */
function loadIndex(): Promise<SearchItem[]> {
    indexRequest ??= fetch(INDEX_URL).then((response) => {
        if (!response.ok) throw new Error(`${INDEX_URL}: ${response.status}`);
        return response.json() as Promise<SearchItem[]>;
    });
    indexRequest.catch(() => {
        indexRequest = undefined; // a failed load can be retried by opening the palette again
    });
    return indexRequest;
}

function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-k-muted">{children}</kbd>;
}

/** The dialog shell shared by the palette and the shortcuts list: centred, hairline, dark, keyboard-first. */
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

/** A result's destination, short: "/docs/config#readiness" → "config#readiness". */
const shortHref = (href: string) => href.replace(/^\/docs\/?/, '').replace(/^\//, '') || 'docs';

/**
 * ⌘K: one input, results grouped as Docs / Configuration / Commands / Keys / Changelog, matched on titles and on
 * what each section says. The combobox pattern (arrow keys move through the listbox, Enter opens).
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter();
    const id = useId();
    const [index, setIndex] = useState<SearchItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!open || index) return;
        loadIndex().then(setIndex, () => setFailed(true));
    }, [open, index]);

    const groups = useMemo(() => {
        if (!index) return [];
        if (!query.trim()) return [{ group: 'Jump to', results: index.filter((i) => i.group === 'Docs' && !i.href.includes('#')).map((i) => ({ ...i, score: 0 })) }];
        return search(index, query);
    }, [index, query]);
    const flat: Result[] = groups.flatMap((g) => g.results);
    const current = flat[Math.min(active, flat.length - 1)];
    const optionId = (i: number) => `${id}-option-${i}`;

    const change = (next: boolean) => {
        if (!next) {
            setQuery('');
            setActive(0);
        }
        onOpenChange(next);
    };

    const go = (result: Result | undefined) => {
        if (!result) return;
        change(false);
        router.push(result.href as Parameters<typeof router.push>[0]);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!flat.length) return;
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const next = (Math.min(active, flat.length - 1) + delta + flat.length) % flat.length;
            setActive(next);
            document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            event.preventDefault();
            go(current);
        }
    };

    let n = -1;
    return (
        <Panel open={open} onOpenChange={change} title="Search">
            <div className="flex items-center gap-3 border-white/[0.06] border-b px-4">
                <span aria-hidden="true" className="font-mono text-k-green">
                    ›
                </span>
                <input
                    // biome-ignore lint/a11y/noAutofocus: the palette was just opened to type into
                    autoFocus
                    role="combobox"
                    aria-expanded={flat.length > 0}
                    aria-controls={`${id}-list`}
                    aria-autocomplete="list"
                    aria-activedescendant={current ? optionId(flat.indexOf(current)) : undefined}
                    aria-label="Search the docs, commands and keys"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Search the docs, commands and keys"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-k-text outline-none placeholder:text-k-muted"
                />
                <Kbd>esc</Kbd>
            </div>

            <div id={`${id}-list`} role="listbox" aria-label="Results" data-lenis-prevent className="max-h-[min(420px,56vh)] overflow-y-auto p-2">
                {failed && <p className="px-3 py-8 text-center text-k-muted text-sm">Search isn&apos;t available right now.</p>}
                {!index && !failed && <p className="px-3 py-8 text-center text-k-muted text-sm">Loading…</p>}
                {index && flat.length === 0 && (
                    <p className="px-3 py-8 text-center text-k-muted text-sm">
                        No results for “{query.trim()}”. Try a command like <code className="font-mono text-k-subtext">kestrel pm</code> or a key.
                    </p>
                )}
                {groups.map((g) => (
                    // biome-ignore lint/a11y/useSemanticElements: a group of listbox options (ARIA listbox pattern), not form fields
                    <div key={g.group} role="group" aria-label={g.group} className="mb-1">
                        <p aria-hidden="true" className="px-3 pt-3 pb-1.5 font-mono text-[10px] text-k-muted uppercase tracking-[0.2em]">
                            {g.group}
                        </p>
                        {g.results.map((r) => {
                            n += 1;
                            const i = n;
                            const selected = r === current;
                            return (
                                // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input handles the keys (arrows and Enter)
                                <div
                                    key={`${r.href}-${r.title}`}
                                    id={optionId(i)}
                                    role="option"
                                    aria-selected={selected}
                                    tabIndex={-1}
                                    onMouseMove={() => setActive(i)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => go(r)}
                                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', selected && 'bg-white/[0.06]')}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className={cn('block truncate text-k-text text-sm', (r.group === 'Commands' || r.group === 'Keys') && 'font-mono')}>{r.title}</span>
                                        {/* A section says what it's about in its own words; a page, command or key in its context line. */}
                                        <span className="block truncate text-k-muted text-xs">{r.excerpt || r.context}</span>
                                    </span>
                                    {selected ? (
                                        <CornerDownLeft aria-hidden="true" className="size-3.5 shrink-0 text-k-muted" />
                                    ) : (
                                        <span aria-hidden="true" className="hidden shrink-0 font-mono text-[11px] text-k-muted sm:block">
                                            {shortHref(r.href)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div aria-hidden="true" className="flex items-center gap-4 border-white/[0.06] border-t px-4 py-2.5 text-[11px] text-k-muted">
                <span className="flex items-center gap-1.5">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd> move
                </span>
                <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd> open
                </span>
                <span className="flex items-center gap-1.5">
                    <Kbd>esc</Kbd> close
                </span>
            </div>
            <p className="sr-only" aria-live="polite">
                {index && query.trim() ? `${flat.length} ${flat.length === 1 ? 'result' : 'results'}` : ''}
            </p>
        </Panel>
    );
}
