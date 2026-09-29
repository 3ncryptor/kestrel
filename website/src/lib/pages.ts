// The docs pages: what each renders from the repository, and the site-wide search index built from them.
import { cache } from 'react';
import cli from '@/generated/cli.json';
import keys from '@/generated/keys.json';
import { readRepoFile, renderMarkdown, withoutTitle } from './docs';
import { extractSections, parseHelp } from './docs-core';
import type { Group, SearchItem } from './search';

export const DOC_PAGES = [
    { href: '/docs', title: 'Guide', description: 'Install, run and verify Kestrel, and fix what goes wrong.', source: 'packaging/npm/README.md' },
    { href: '/docs/config', title: 'Configuration', description: 'Every kestrel.json option, with its default.', source: 'docs/CONFIG.md' },
    { href: '/docs/commands', title: 'Commands', description: 'Every command and option, from kestrel --help.', source: 'cli/commands/help.js' },
    { href: '/docs/keys', title: 'Keys', description: 'Every key in the app, from its key map. Press one to find it.', source: 'ui/keymap.js' },
    { href: '/changelog', title: 'Changelog', description: 'What changed in each release.', source: 'CHANGELOG.md' },
] as const;

export type DocHref = (typeof DOC_PAGES)[number]['href'];

export const pageFor = (href: DocHref) => DOC_PAGES.find((p) => p.href === href) ?? DOC_PAGES[0];

/** The guide is the npm README from "Install" on; Keys has its own page, and the footer covers the links. */
export const guideDoc = cache(async () => {
    const readme = await readRepoFile('packaging/npm/README.md');
    return renderMarkdown(extractSections(readme, { from: 'Install', exclude: ['Keys', 'Links', 'License'] }), 'packaging/npm/README.md');
});

export const configDoc = cache(async () => renderMarkdown(withoutTitle(await readRepoFile('docs/CONFIG.md')), 'docs/CONFIG.md'));

export const changelogDoc = cache(async () => renderMarkdown(withoutTitle(await readRepoFile('CHANGELOG.md')), 'CHANGELOG.md'));

export const help = () => parseHelp(cli.help);

export type KeyGroup = { context: string; title: string; entries: Array<{ keys: string[]; label: string }> };
export const keyGroups = () => keys as KeyGroup[];

/** Everything ⌘K can find: pages, their sections (with the start of their text), commands and keys. */
export const searchIndex = cache(async (): Promise<SearchItem[]> => {
    const [guide, config, changelog] = await Promise.all([guideDoc(), configDoc(), changelogDoc()]);
    const sections = (href: string, page: string, group: Group, toc: Awaited<ReturnType<typeof guideDoc>>['toc']): SearchItem[] =>
        toc.map((t) => ({ href: `${href}#${t.id}`, title: t.text, group, context: page, excerpt: t.excerpt }));
    return [
        ...DOC_PAGES.map((p): SearchItem => ({ href: p.href, title: p.title, group: 'Docs', context: p.description })),
        ...sections('/docs', 'Guide', 'Docs', guide.toc),
        ...sections('/docs/config', 'Configuration', 'Configuration', config.toc),
        ...sections('/changelog', 'Changelog', 'Changelog', changelog.toc.filter((t) => /^\[?\d/.test(t.text))),
        ...help().commands.map((c): SearchItem => ({ href: '/docs/commands#commands', title: c.usage, group: 'Commands', context: c.description })),
        ...help().options.map((o): SearchItem => ({ href: '/docs/commands#options', title: o.usage, group: 'Commands', context: o.description })),
        ...keyGroups().flatMap((g) => g.entries.map((e): SearchItem => ({ href: `/docs/keys#${g.context}`, title: e.label, group: 'Keys', context: `${e.keys.join(' ')} · ${g.title}` }))),
    ];
});
