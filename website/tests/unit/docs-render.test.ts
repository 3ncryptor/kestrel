import { describe, expect, test } from 'vitest';
import { readRepoFile, renderMarkdown, withoutTitle } from '@/lib/docs';

describe('renderMarkdown', () => {
    test('headings get ids, anchors and a table of contents, each with the start of its section for search', async () => {
        const { html, toc } = await renderMarkdown('## Where Kestrel looks\n\ntext\n\n### Readiness\n\nmore\n', 'docs/CONFIG.md');
        expect(toc).toEqual([
            { id: 'where-kestrel-looks', text: 'Where Kestrel looks', depth: 2, excerpt: 'text' },
            { id: 'readiness', text: 'Readiness', depth: 3, excerpt: 'more' },
        ]);
        expect(html).toContain('<h2 id="where-kestrel-looks">');
        expect(html).toContain('href="#readiness"');
    });

    test('links are rewritten for the site, and external ones get rel=noopener', async () => {
        const { html } = await renderMarkdown('[config](CONFIG.md) [plan](BUILD_PLAN.md) [npm](https://www.npmjs.com)', 'docs/CONFIG.md');
        expect(html).toContain('href="/docs/config"');
        expect(html).toContain('href="https://github.com/3ncryptor/kestrel/blob/main/docs/BUILD_PLAN.md"');
        expect(html).toMatch(/href="https:\/\/www\.npmjs\.com" rel="noopener"/);
    });

    test('code is highlighted at build time and keeps its source for the copy button', async () => {
        const { html } = await renderMarkdown('```json\n{ "version": 1 }\n```\n', 'docs/CONFIG.md');
        expect(html).toContain('data-code="{ &#x22;version&#x22;: 1 }"');
        expect(html).toContain('data-lang="json"');
        expect(html).toMatch(/<span style="color:#[0-9A-Fa-f]{6}/);
    });

    test('raw HTML in the markdown never reaches the page', async () => {
        const { html } = await renderMarkdown('hello <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n<div onclick="x()">block</div>\n', 'README.md');
        expect(html).not.toMatch(/<script|onerror|onclick|<img|<div/);
        expect(html).toContain('hello');
    });

    test('wide tables are wrapped so they scroll on small screens', async () => {
        const { html } = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n', 'docs/CONFIG.md');
        expect(html).toMatch(/<div class="table-scroll"><table>/);
    });
});

describe('the real documents', () => {
    test('docs/CONFIG.md renders with its sections in the table of contents', async () => {
        const { toc } = await renderMarkdown(withoutTitle(await readRepoFile('docs/CONFIG.md')), 'docs/CONFIG.md');
        expect(toc.map((t) => t.text)).toEqual(expect.arrayContaining(['Where Kestrel looks', 'Processes', 'Readiness', 'Restarts']));
        // A section is found by what it says: the restarts section explains crashes without "crash" in its title.
        expect(toc.find((t) => t.text === 'Restarts')?.excerpt).toMatch(/crash/i);
        expect(toc.every((t) => (t.excerpt ?? '').length <= 280)).toBe(true);
    });
});
