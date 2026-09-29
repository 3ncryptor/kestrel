// Renders the repository's markdown into the site's docs pages at build time (server only).
// Raw HTML in the markdown is dropped (remark-rehype's default), so only markdown we wrote becomes markup.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { createHighlighter, type Highlighter } from 'shiki';
import { unified } from 'unified';
import { rewriteHref } from './docs-core';
import { kestrelTheme } from './shiki-theme';

/** The repository root: the site lives in website/, the documents it renders are one level up. */
const REPO_ROOT = path.resolve(process.cwd(), '..');
const LANGUAGES = ['json', 'jsonc', 'sh', 'bash', 'shell', 'text'] as const;
const ALIASES: Record<string, string> = { console: 'sh', zsh: 'sh', txt: 'text', '': 'text' };

export interface TocEntry {
    id: string;
    text: string;
    depth: 2 | 3;
    /** The start of the section's text, for search (rendered markdown only; hand-made lists leave it out). */
    excerpt?: string;
}

/** How much of each section search sees: enough to find it by what it says, small enough to ship. */
const EXCERPT_CHARS = 280;

export interface RenderedDoc {
    html: string;
    toc: TocEntry[];
}

let highlighter: Promise<Highlighter> | undefined;
const getHighlighter = () => {
    highlighter ??= createHighlighter({ themes: [kestrelTheme], langs: [...LANGUAGES] });
    return highlighter;
};

export async function readRepoFile(file: string): Promise<string> {
    return fs.readFile(path.join(REPO_ROOT, file), 'utf-8');
}

/** Drops the document's own `# Title` (each page renders its title itself). */
export function withoutTitle(markdown: string): string {
    return markdown.replace(/^# .*\n+/, '');
}

type Visit = (node: Element, parent: Root | Element, index: number) => void;

function walk(node: Root | Element, visit: Visit) {
    node.children.forEach((child, index) => {
        if (child.type !== 'element') return;
        visit(child, node, index);
        walk(child, visit);
    });
}

const el = (tagName: string, properties: Element['properties'], children: ElementContent[] = []): Element => ({ type: 'element', tagName, properties, children });

/** Links, heading anchors and the table of contents, wide tables, and highlighted code. */
function siteTransform(sourceFile: string, toc: TocEntry[], shiki: Highlighter) {
    return () => (tree: Root) => {
        const replacements: Array<{ parent: Root | Element; index: number; node: Element }> = [];
        walk(tree, (node, parent, index) => {
            if (node.tagName === 'a' && typeof node.properties.href === 'string') {
                const href = rewriteHref(node.properties.href, sourceFile);
                node.properties.href = href;
                if (/^https?:\/\//.test(href)) node.properties.rel = ['noopener'];
            }
            if ((node.tagName === 'h2' || node.tagName === 'h3') && typeof node.properties.id === 'string') {
                const id = node.properties.id;
                toc.push({ id, text: hastToString(node), depth: node.tagName === 'h2' ? 2 : 3, excerpt: '' });
                node.children.push(el('a', { href: `#${id}`, className: ['heading-anchor'], ariaLabel: `Link to “${hastToString(node)}”` }, [{ type: 'text', value: '#' }]));
            }
            if (node.tagName === 'table') {
                replacements.push({ parent, index, node: el('div', { className: ['table-scroll'] }, [node]) });
            }
            if (node.tagName === 'pre') {
                const code = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
                if (!code) return;
                const classes = Array.isArray(code.properties.className) ? code.properties.className.map(String) : [];
                const requested = (classes.find((c) => c.startsWith('language-')) ?? '').replace('language-', '');
                const lang = ALIASES[requested] ?? (LANGUAGES.includes(requested as (typeof LANGUAGES)[number]) ? requested : 'text');
                const text = hastToString(code).replace(/\n$/, '');
                const highlighted = shiki.codeToHast(text, { lang, theme: 'kestrel' });
                const pre = highlighted.children[0] as Element;
                pre.properties.dataCode = text;
                pre.properties.dataLang = lang;
                pre.properties.tabIndex = 0; // it scrolls, so keyboard users must be able to reach it
                replacements.push({ parent, index, node: pre });
            }
        });
        for (const { parent, index, node } of replacements) (parent.children as RootContent[])[index] = node;
        excerpts(tree, toc);
    };
}

/** Each section's text: the top-level nodes between its heading and the next one. */
function excerpts(tree: Root, toc: TocEntry[]) {
    const byId = new Map(toc.map((entry) => [entry.id, entry]));
    let current: TocEntry | undefined;
    for (const child of tree.children) {
        if (child.type !== 'element') continue;
        if ((child.tagName === 'h2' || child.tagName === 'h3') && typeof child.properties.id === 'string') {
            current = byId.get(child.properties.id);
            continue;
        }
        if (current && (current.excerpt ?? '').length < EXCERPT_CHARS) {
            current.excerpt = `${current.excerpt ?? ''} ${hastToString(child)}`.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS);
        }
    }
}

/** Markdown from the repository → HTML and a table of contents. `sourceFile` resolves relative links. */
export async function renderMarkdown(markdown: string, sourceFile: string): Promise<RenderedDoc> {
    const toc: TocEntry[] = [];
    const shiki = await getHighlighter();
    const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSlug)
        .use(siteTransform(sourceFile, toc, shiki))
        .use(rehypeStringify)
        .process(markdown);
    return { html: String(file), toc };
}
