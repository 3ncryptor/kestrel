'use client';

import { AnimatePresence, motion } from 'motion/react';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/cn';
import { INSTALL } from '@/lib/site';

const TABS = [
    { id: 'npm', label: 'npm', command: INSTALL.npm, note: 'Installs the kestrel command. No install scripts run.' },
    { id: 'npx', label: 'npx', command: INSTALL.npx, note: 'Try it without installing anything.' },
    { id: 'curl', label: 'curl', command: INSTALL.curl, note: 'The standalone binary, checksum-verified, into ~/.local/bin.' },
] as const;

const COPIED_MS = 1600;

export function copyText(text: string, what = 'Command') {
    navigator.clipboard.writeText(text).then(
        () => toast.success(`${what} copied`, { description: text }),
        () => toast.error('Could not copy', { description: 'Select the text and copy it instead.' }),
    );
}

/** Install tabs (npm · npx · curl) with a copy button; the ARIA tabs pattern, arrow keys included. */
export function InstallCommand({ className }: { className?: string }) {
    const [active, setActive] = useState(0);
    const [copied, setCopied] = useState(false);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const id = useId();
    const tab = TABS[active] ?? TABS[0];

    const onKeyDown = (event: KeyboardEvent) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = (active + step + TABS.length) % TABS.length;
        setActive(next);
        tabRefs.current[next]?.focus();
    };

    const copy = () => {
        copyText(tab.command);
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
    };

    return (
        <div className={cn('w-full max-w-xl text-left', className)}>
            <div role="tablist" aria-label="Install with" className="flex gap-1" onKeyDown={onKeyDown}>
                {TABS.map((t, i) => (
                    <button
                        key={t.id}
                        ref={(el) => {
                            tabRefs.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        id={`${id}-tab-${t.id}`}
                        aria-selected={i === active}
                        aria-controls={`${id}-panel`}
                        tabIndex={i === active ? 0 : -1}
                        onClick={() => setActive(i)}
                        className={cn(
                            'relative rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                            i === active ? 'text-k-text' : 'text-k-muted hover:text-k-subtext',
                        )}
                    >
                        {i === active && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-md bg-white/[0.07]" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                        <span className="relative">{t.label}</span>
                    </button>
                ))}
            </div>
            <div
                role="tabpanel"
                id={`${id}-panel`}
                aria-labelledby={`${id}-tab-${tab.id}`}
                className="mt-2 flex items-center gap-3 rounded-lg border border-white/10 bg-k-mantle/80 py-2 pr-2 pl-4 backdrop-blur"
            >
                <span aria-hidden="true" className="font-mono text-k-mauve text-sm">
                    $
                </span>
                <code className="min-w-0 flex-1 break-all font-mono text-k-text text-sm">{tab.command}</code>
                <button
                    type="button"
                    onClick={copy}
                    aria-label={`Copy: ${tab.command}`}
                    className="relative grid size-8 shrink-0 place-items-center rounded-md text-k-subtext transition-colors hover:bg-white/[0.07] hover:text-k-text active:scale-95"
                >
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.svg
                            key={copied ? 'done' : 'copy'}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            viewBox="0 0 24 24"
                            className={cn('size-4', copied && 'text-k-green')}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            {copied ? <path d="M20 6 9 17l-5-5" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
                        </motion.svg>
                    </AnimatePresence>
                </button>
            </div>
            <p className="mt-2 text-k-muted text-xs">{tab.note}</p>
        </div>
    );
}
