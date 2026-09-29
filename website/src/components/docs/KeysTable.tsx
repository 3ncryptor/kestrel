'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { KeyGroup } from '@/lib/pages';

const FLASH_MS = 1400;

// KeyboardEvent.key → the ids Kestrel's key map uses (ui/keymap.js keyId()).
const NAMED: Record<string, string> = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'return', Escape: 'escape',
    Tab: 'tab', PageUp: 'pageup', PageDown: 'pagedown', Home: 'home', End: 'end',
};

export function keyIdOf(event: Pick<KeyboardEvent, 'key' | 'ctrlKey'>): string {
    if (event.ctrlKey && event.key.length === 1) return `ctrl+${event.key.toLowerCase()}`;
    return NAMED[event.key] ?? event.key;
}

/** "↑↓ select" → ["↑↓", "select"]: how the app itself shows a binding. */
function split(label: string): [string, string] {
    const space = label.indexOf(' ');
    return space === -1 ? [label, ''] : [label.slice(0, space), label.slice(space + 1)];
}

/** Every key of the app, grouped as the `?` help shows it. Press a key and its rows light up. */
export function KeysTable({ groups }: { groups: KeyGroup[] }) {
    const [lit, setLit] = useState<{ id: string; at: number } | null>(null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
            setLit({ id: keyIdOf(event), at: Date.now() });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (!lit) return;
        document.querySelector('[data-lit="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const timer = setTimeout(() => setLit(null), FLASH_MS);
        return () => clearTimeout(timer);
    }, [lit]);

    return (
        <div className="space-y-10">
            <p className="rounded-lg border border-k-mauve/30 bg-k-mauve/[0.05] px-4 py-3 text-sm" aria-live="polite">
                {lit ? (
                    <>
                        <kbd className="font-mono text-k-mauve">{lit.id}</kbd>{' '}
                        {groups.some((g) => g.entries.some((e) => e.keys.includes(lit.id))) ? 'is highlighted below.' : 'is not bound in Kestrel.'}
                    </>
                ) : (
                    'Press any key to find what it does in Kestrel.'
                )}
            </p>
            {groups.map((group) => (
                <section key={group.context} id={group.context} aria-labelledby={`${group.context}-title`}>
                    <h2 id={`${group.context}-title`} className="font-semibold text-k-text text-xl">
                        {group.title}
                    </h2>
                    <div className="table-scroll mt-4">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Key</th>
                                    <th scope="col">What it does</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.entries.map((entry) => {
                                    const [key, what] = split(entry.label);
                                    const on = Boolean(lit && entry.keys.includes(lit.id));
                                    return (
                                        <tr key={entry.label} data-lit={on} className={cn('transition-colors duration-300', on && 'bg-k-mauve/15')}>
                                            <td>
                                                <kbd className={cn('rounded-md border px-2 py-0.5 font-mono text-xs transition-colors', on ? 'border-k-mauve text-k-mauve' : 'border-white/15 text-k-text')}>{key}</kbd>
                                            </td>
                                            <td>{what}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    );
}
