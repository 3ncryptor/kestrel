// The docs pages: what each renders from the repository, and the site-wide search index built from them.
import { cache } from 'react';
import type { SpotlightItem } from '@/components/ui/spotlight-search';
import cli from '@/generated/cli.json';
import keys from '@/generated/keys.json';
import { readRepoFile, renderMarkdown, withoutTitle } from './docs';
import { extractSections, parseHelp } from './docs-core';

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

/** Everything ⌘K can find: pages, their sections, commands and keys (the item id is where it goes). */
export const searchIndex = cache(async (): Promise<SpotlightItem[]> => {
    const [guide, config, changelog] = await Promise.all([guideDoc(), configDoc(), changelogDoc()]);
    const items: SpotlightItem[] = DOC_PAGES.map((p) => ({ id: p.href, title: p.title, category: 'docs', subtitle: p.description }));
    const sections = (href: string, page: string, toc: Array<{ id: string; text: string }>, category: SpotlightItem['category']) =>
        toc.map((t) => ({ id: `${href}#${t.id}`, title: t.text, category, subtitle: page }));
    items.push(...sections('/docs', 'Guide', guide.toc, 'docs'), ...sections('/docs/config', 'Configuration', config.toc, 'folders'));
    items.push(...sections('/changelog', 'Changelog', changelog.toc.filter((t) => /^\[?\d/.test(t.text)), 'docs'));
    items.push(...help().commands.map((c) => ({ id: '/docs/commands#commands', title: c.usage, category: 'apps' as const, subtitle: c.description })));
    items.push(...help().options.map((o) => ({ id: '/docs/commands#options', title: o.usage, category: 'apps' as const, subtitle: o.description })));
    for (const group of keyGroups()) {
        for (const entry of group.entries) items.push({ id: `/docs/keys#${group.context}`, title: entry.label, category: 'layers', subtitle: group.title });
    }
    return items.map((item, i) => ({ ...item, id: `${item.id}|${i}` }));
});
