// Pure helpers behind the docs pages (no file system, so they are unit-tested directly).
import path from 'node:path';

export const REPO_BLOB = 'https://github.com/3ncryptor/kestrel/blob/main';

/** Repository documents that are pages of this site. */
const SITE_ROUTES: Record<string, string> = {
    'docs/CONFIG.md': '/docs/config',
    'CHANGELOG.md': '/changelog',
    'packaging/npm/README.md': '/docs',
};

const headingPattern = (title: string) => new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');

/** Splits markdown into its `## ` sections (the text before the first one is dropped). */
function sections(markdown: string): Array<{ title: string; body: string }> {
    const parts = markdown.split(/^(?=## )/m).slice(1);
    return parts.map((body) => ({ title: body.slice(3, body.indexOf('\n')).trim(), body }));
}

/**
 * The document from `## <from>` on, without the `exclude`d sections. Throws when a named heading is missing,
 * so an edit to the source document can't quietly drop part of a page.
 */
export function extractSections(markdown: string, { from, exclude = [] }: { from: string; exclude?: string[] }): string {
    for (const title of [from, ...exclude]) {
        if (!headingPattern(title).test(markdown)) throw new Error(`the document has no "## ${title}" heading`);
    }
    const all = sections(markdown);
    const start = all.findIndex((s) => s.title === from);
    return all
        .slice(start)
        .filter((s) => !exclude.includes(s.title))
        .map((s) => s.body)
        .join('');
}

/** A link from a repository document, rewritten for the site: its own pages locally, other files on GitHub. */
export function rewriteHref(href: string, sourceFile: string): string {
    if (href.startsWith('#') || /^(mailto|tel):/.test(href)) return href;
    let target = href;
    if (href.startsWith(`${REPO_BLOB}/`)) target = href.slice(REPO_BLOB.length + 1);
    else if (/^[a-z]+:\/\//i.test(href)) return href;
    else target = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), href));
    const [file = '', hash] = target.split('#');
    const route = SITE_ROUTES[file];
    if (route) return hash ? `${route}#${hash}` : route;
    return `${REPO_BLOB}/${file}${hash ? `#${hash}` : ''}`;
}

export interface HelpEntry {
    usage: string;
    description: string;
}

/** `kestrel --help` (captured from the real CLI) → its Usage and Options rows. */
export function parseHelp(text: string): { commands: HelpEntry[]; options: HelpEntry[] } {
    const blocks: Record<string, HelpEntry[]> = {};
    let current: HelpEntry[] | null = null;
    for (const line of text.split('\n')) {
        if (/^\S/.test(line)) {
            current = blocks[line.trim()] = [];
            continue;
        }
        const row = /^ {2}(\S.*?)\s{2,}(\S.*)$/.exec(line);
        if (row && current) current.push({ usage: row[1] ?? '', description: row[2] ?? '' });
    }
    return { commands: blocks.Usage ?? [], options: blocks.Options ?? [] };
}
