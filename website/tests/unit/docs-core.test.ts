import { describe, expect, test } from 'vitest';
import cli from '@/generated/cli.json';
import { extractSections, parseHelp, rewriteHref } from '@/lib/docs-core';

const README = `# kestrel-tui

intro and badges

## Contents

- [Install](#install)

## Install

npm install

## Keys

| key | what |

## Troubleshooting

fix it
`;

describe('extractSections', () => {
    test('keeps the document from a heading on, without the excluded sections', () => {
        const out = extractSections(README, { from: 'Install', exclude: ['Keys'] });
        expect(out).toBe('## Install\n\nnpm install\n\n## Troubleshooting\n\nfix it\n');
    });

    test('a document that starts with its first section keeps it', () => {
        expect(extractSections('## Install\n\nnpm install\n', { from: 'Install' })).toBe('## Install\n\nnpm install\n');
    });

    test('a heading on the last line, with no newline after it, keeps its whole title', () => {
        expect(extractSections('## Install\n\nnpm install\n\n## Troubleshooting', { from: 'Install', exclude: ['Troubleshooting'] })).toBe('## Install\n\nnpm install\n\n');
    });

    test('fails loudly when an expected heading is missing, so a README edit cannot silently break a page', () => {
        expect(() => extractSections(README, { from: 'Installation' })).toThrow(/no "## Installation" heading/);
        expect(() => extractSections(README, { from: 'Install', exclude: ['Usage'] })).toThrow(/no "## Usage" heading/);
    });
});

describe('rewriteHref', () => {
    test('links to documents that are site pages become site routes', () => {
        expect(rewriteHref('docs/CONFIG.md', 'README.md')).toBe('/docs/config');
        expect(rewriteHref('CONFIG.md#processes', 'docs/CONFIG.md')).toBe('/docs/config#processes');
        expect(rewriteHref('https://github.com/3ncryptor/kestrel/blob/main/docs/CONFIG.md', 'README.md')).toBe('/docs/config');
        expect(rewriteHref('../CHANGELOG.md', 'docs/CONFIG.md')).toBe('/changelog');
    });

    test('other repository files point at GitHub, resolved from the source file', () => {
        expect(rewriteHref('../LICENSE', 'docs/CONFIG.md')).toBe('https://github.com/3ncryptor/kestrel/blob/main/LICENSE');
        expect(rewriteHref('BUILD_PLAN.md#11-quality', 'docs/CONFIG.md')).toBe('https://github.com/3ncryptor/kestrel/blob/main/docs/BUILD_PLAN.md#11-quality');
    });

    test('script and data URLs are never linked, whatever their case or spacing', () => {
        for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:void(0)', 'vbscript:x', 'data:text/html,<script>x</script>']) {
            expect(rewriteHref(href, 'README.md'), href).toBe('#');
        }
    });

    test('anchors, external links and mail links are left alone', () => {
        expect(rewriteHref('#readiness', 'docs/CONFIG.md')).toBe('#readiness');
        expect(rewriteHref('https://docs.npmjs.com/x', 'README.md')).toBe('https://docs.npmjs.com/x');
        expect(rewriteHref('mailto:a@b.c', 'README.md')).toBe('mailto:a@b.c');
    });
});

describe('parseHelp', () => {
    test('turns the real kestrel --help into commands and options', () => {
        const help = parseHelp(cli.help);
        expect(help.commands.map((c) => c.usage)).toEqual(expect.arrayContaining(['kestrel', 'kestrel sm', 'kestrel pm', 'kestrel init', 'kestrel doctor']));
        expect(help.commands.find((c) => c.usage === 'kestrel pm')?.description).toMatch(/Start this project's stack/);
        expect(help.options.find((o) => o.usage.startsWith('--config'))?.description).toMatch(/kestrel\.json/);
        expect(help.options.length).toBeGreaterThanOrEqual(6);
    });
});
