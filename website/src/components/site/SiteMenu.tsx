'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, Package, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { INSTALL, SITE } from '@/lib/site';
import { CopyButton } from './CopyButton';
import { GithubMark } from './GithubMark';
import { PillLink } from './PillLink';

const LINKS = [
    { href: '/', label: 'Home' },
    { href: '/#how-it-works', label: 'How it works' },
    { href: '/#features', label: 'Features' },
    { href: '/docs', label: 'Docs' },
    { href: '/changelog', label: 'Changelog' },
] as const;

const STAGGER_S = 0.05;
const pill = 'inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-k-text text-sm transition-colors hover:border-white/30';

/** The Menu pill and what it opens: the site's few places, big and numbered, over the whole screen. */
export function SiteMenu() {
    const reduced = useReducedMotion();
    return (
        <Dialog.Root>
            <Dialog.Trigger className={pill}>
                Menu
                <Menu aria-hidden="true" className="size-4" />
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Content
                    aria-describedby={undefined}
                    className="fixed inset-0 z-[80] flex flex-col bg-black outline-none data-[state=open]:animate-[fade-in_200ms_ease-out]"
                >
                    <Dialog.Title className="sr-only">Menu</Dialog.Title>
                    <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-end px-6">
                        <Dialog.Close className={pill}>
                            Close
                            <X aria-hidden="true" className="size-4" />
                        </Dialog.Close>
                    </div>
                    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-12 overflow-y-auto px-6 py-10 lg:grid-cols-[1fr_320px]">
                        <nav aria-label="Menu" className="flex flex-col justify-center">
                            <ol className="space-y-2">
                                {LINKS.map((link, i) => (
                                    <motion.li
                                        key={link.href}
                                        initial={reduced ? false : { opacity: 0, y: 24 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: i * STAGGER_S, ease: [0.16, 1, 0.3, 1] }}
                                    >
                                        <Dialog.Close asChild>
                                            <Link href={link.href as '/docs'} className="group flex items-baseline gap-4 font-bold text-5xl text-k-text tracking-[-0.03em] sm:text-7xl">
                                                <span className="font-mono font-normal text-k-muted text-sm tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                                                <span className="transition-colors group-hover:text-k-green">{link.label}</span>
                                            </Link>
                                        </Dialog.Close>
                                    </motion.li>
                                ))}
                            </ol>
                        </nav>
                        <div className="flex flex-col justify-between gap-10 border-white/[0.06] lg:border-l lg:pl-10">
                            <div>
                                <p className="text-k-muted text-sm">Project</p>
                                <div className="mt-4 flex gap-3">
                                    <a href={SITE.repo} aria-label="Kestrel on GitHub" className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-k-text transition-colors hover:border-white/30">
                                        <GithubMark className="size-5" />
                                    </a>
                                    <a href={SITE.npm} aria-label="kestrel-tui on npm" className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-k-text transition-colors hover:border-white/30">
                                        <Package aria-hidden="true" className="size-5" />
                                    </a>
                                </div>
                            </div>
                            <div>
                                <p className="text-k-muted text-sm">Install</p>
                                <div className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] py-1 pr-1 pl-4">
                                    <code className="min-w-0 flex-1 truncate font-mono text-k-text text-xs">{INSTALL.npm}</code>
                                    <CopyButton text={INSTALL.npm} />
                                </div>
                                <div className="mt-6">
                                    <PillLink href={SITE.repo} variant="primary">
                                        <GithubMark />
                                        Star on GitHub
                                    </PillLink>
                                </div>
                            </div>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
