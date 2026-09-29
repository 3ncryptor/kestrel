import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TocEntry } from '@/lib/docs';
import { REPO_BLOB } from '@/lib/docs-core';
import { DOC_PAGES, type DocHref, pageFor } from '@/lib/pages';
import { CodeCopy } from './CodeCopy';
import { Toc } from './Toc';

/**
 * One docs page: title, content (rendered markdown or a component), "on this page", prev/next and a link
 * to edit the source on GitHub.
 */
export function DocPage({ href, toc = [], html, children }: { href: DocHref; toc?: TocEntry[]; html?: string; children?: ReactNode }) {
    const page = pageFor(href);
    const index = DOC_PAGES.findIndex((p) => p.href === href);
    const prev = DOC_PAGES[index - 1];
    const next = DOC_PAGES[index + 1];
    // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown from this repository, rendered at build time with raw HTML removed (lib/docs.ts)
    const markup = html !== undefined ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null;
    return (
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_14rem]">
            <article className="min-w-0">
                <p className="font-mono text-k-teal text-xs uppercase tracking-[0.2em]">Docs</p>
                <h1 className="mt-3 font-semibold text-4xl text-k-text tracking-tight">{page.title}</h1>
                <p className="mt-4 text-lg">{page.description}</p>
                <div className="docs-prose mt-10">{markup ?? children}</div>
                {markup && <CodeCopy />}
                <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-white/[0.06] border-t pt-6 text-sm">
                    <a href={`${REPO_BLOB}/${page.source}`} className="text-k-muted transition-colors hover:text-k-text">
                        Edit this page on GitHub ↗
                    </a>
                    <span className="flex gap-3">
                        {prev && (
                            <Link href={prev.href as '/docs'} className="rounded-lg border border-white/10 px-4 py-2 transition-colors hover:border-k-mauve/40 hover:text-k-text">
                                ← {prev.title}
                            </Link>
                        )}
                        {next && (
                            <Link href={next.href as '/docs'} className="rounded-lg border border-white/10 px-4 py-2 transition-colors hover:border-k-mauve/40 hover:text-k-text">
                                {next.title} →
                            </Link>
                        )}
                    </span>
                </footer>
            </article>
            <aside className="hidden xl:block">
                <div className="sticky top-24">
                    <Toc entries={toc} />
                </div>
            </aside>
        </div>
    );
}
