'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from 'react';
import { decodeFirst, type EncodedFrames, type Frame } from '@/lib/frames';
import { TerminalFrame } from './TerminalFrame';
import { TerminalWindow } from './TerminalWindow';

/** How long the page stays "exited" before it boots back. */
const EXITED_MS = 1600;

const typing = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'));

/**
 * Press q anywhere (as in Kestrel) and Kestrel's own quit dialog appears, captured from the app with the stack
 * running. y "quits" the page for a moment; n or Esc cancels. Not on the keys page, where q finds the key.
 */
export function QuitEgg() {
    const pathname = usePathname();
    const [frame, setFrame] = useState<Frame | null>(null);
    const [open, setOpen] = useState(false);
    const [exited, setExited] = useState(false);

    useEffect(() => {
        if (pathname.startsWith('/docs/keys')) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'q' || event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || exited) return;
            import('@/generated/hero-quit.json').then((m) => {
                setFrame(decodeFirst(m.default as unknown as EncodedFrames));
                setOpen(true);
            });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pathname, exited]);

    useEffect(() => {
        if (!exited) return;
        const timer = window.setTimeout(() => setExited(false), EXITED_MS);
        return () => window.clearTimeout(timer);
    }, [exited]);

    const onDialogKey = (event: ReactKeyboardEvent) => {
        if (event.key === 'y') {
            setOpen(false);
            setExited(true);
        } else if (event.key === 'n') {
            setOpen(false);
        }
    };

    return (
        <>
            <Dialog.Root open={open} onOpenChange={setOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms_ease-out]" />
                    <Dialog.Content
                        onKeyDown={onDialogKey}
                        aria-describedby={undefined}
                        className="fixed top-1/2 left-1/2 z-[70] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 outline-none"
                    >
                        <Dialog.Title className="sr-only">Stop 4 running processes and quit? Press y to quit, or Esc to cancel.</Dialog.Title>
                        {frame && (
                            <TerminalWindow title="kestrel pm — myapp — 100×30">
                                <TerminalFrame frame={frame} />
                            </TerminalWindow>
                        )}
                        <p className="mt-4 text-center font-mono text-k-muted text-xs">You pressed q, so Kestrel asks first. y quits · Esc cancels</p>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
            {exited && (
                <div role="status" className="fixed inset-0 z-[90] grid place-items-center bg-black font-mono text-k-muted text-sm">
                    [process exited]
                </div>
            )}
        </>
    );
}
