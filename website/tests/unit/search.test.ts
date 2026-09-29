import { describe, expect, test } from 'vitest';
import { PER_GROUP, type SearchItem, score, search } from '@/lib/search';

const ITEMS: SearchItem[] = [
    { href: '/docs', title: 'Guide', group: 'Docs', context: 'Install, run and verify Kestrel' },
    { href: '/docs/config#restart', title: 'Restart policy', group: 'Configuration', context: 'Configuration', excerpt: 'A process that exits is restarted with backoff after a crash.' },
    { href: '/docs/config#readiness', title: 'Readiness', group: 'Configuration', context: 'Configuration', excerpt: 'A process is ready when its port opens.' },
    { href: '/docs/commands#commands', title: 'kestrel pm', group: 'Commands', context: "Start this project's stack" },
    { href: '/docs/keys#global', title: 'Quit', group: 'Keys', context: 'Everywhere' },
];

describe('score', () => {
    test('a title prefix beats a match inside the title, which beats the context, which beats the section text', () => {
        const item: SearchItem = { href: '#', title: 'Restart policy', group: 'Configuration', context: 'policy for crashes', excerpt: 'backoff' };
        expect(score(item, 'rest')).toBeGreaterThan(score(item, 'policy'));
        expect(score({ ...item, title: 'x policy' }, 'policy')).toBeGreaterThan(score({ ...item, title: 'x' }, 'policy'));
        expect(score({ ...item, title: 'x' }, 'crashes')).toBeGreaterThan(score({ ...item, title: 'x' }, 'backoff'));
    });

    test('every word must match somewhere, in any case', () => {
        expect(score(ITEMS[1] as SearchItem, 'RESTART backoff')).toBeGreaterThan(0);
        expect(score(ITEMS[1] as SearchItem, 'restart banana')).toBe(0);
    });

    test('an empty query matches nothing (the palette shows its suggestions instead)', () => {
        expect(score(ITEMS[0] as SearchItem, '   ')).toBe(0);
    });
});

describe('search', () => {
    test('finds a section by what it says, not only by its title: "crash" finds the restart policy', () => {
        const groups = search(ITEMS, 'crash');
        expect(groups.flatMap((g) => g.results.map((r) => r.href))).toEqual(['/docs/config#restart']);
    });

    test('puts the group with the best match first, best first within each group', () => {
        const groups = search(ITEMS, 'kestrel');
        expect(groups.map((g) => g.group)).toEqual(['Commands', 'Docs']);
        expect(groups[0]?.results[0]?.title).toBe('kestrel pm');
    });

    test(`shows at most ${PER_GROUP} results per group`, () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ href: `/k${i}`, title: `key ${i}`, group: 'Keys' as const, context: 'x' }));
        expect(search(many, 'key')[0]?.results).toHaveLength(PER_GROUP);
    });
});
