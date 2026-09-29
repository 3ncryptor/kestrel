// The ⌘K palette's data and ranking. Pure: the index is built at build time (lib/pages.ts, served as
// /search.json), and the ranking runs in the browser.

export const GROUPS = ['Docs', 'Configuration', 'Commands', 'Keys', 'Changelog'] as const;
export type Group = (typeof GROUPS)[number];

export interface SearchItem {
    /** Where it goes: a page, or a section of one. */
    href: string;
    title: string;
    group: Group;
    /** A short line under the title: the page it's on, or what a command or key does. */
    context: string;
    /** Plain text from the section, so a query finds sections that mention it without naming it. */
    excerpt?: string;
}

export interface Result extends SearchItem {
    score: number;
}

/** At most this many results per group, so one group can't bury the others. */
export const PER_GROUP = 6;

const normalize = (text: string) => text.toLowerCase().normalize('NFKD');

/**
 * How well an item matches: every word of the query must appear in it somewhere. A match in the title counts most
 * (a prefix most of all), then the context, then the section text. 0 means no match.
 */
export function score(item: SearchItem, query: string): number {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    const title = normalize(item.title);
    const context = normalize(item.context);
    const excerpt = normalize(item.excerpt ?? '');
    let total = 0;
    for (const word of words) {
        if (title.startsWith(word)) total += 8;
        else if (title.includes(word)) total += 5;
        else if (context.includes(word)) total += 2;
        else if (excerpt.includes(word)) total += 1;
        else return 0;
    }
    return total;
}

/**
 * The results for a query, best first within each group, and the group with the best match first (so Enter opens
 * the best match); groups that tie keep the order of GROUPS.
 */
export function search(items: readonly SearchItem[], query: string): Array<{ group: Group; results: Result[] }> {
    const ranked = items
        .map((item) => ({ ...item, score: score(item, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.title.length - b.title.length);
    return GROUPS.map((group) => ({ group, results: ranked.filter((r) => r.group === group).slice(0, PER_GROUP) }))
        .filter((g) => g.results.length > 0)
        .sort((a, b) => (b.results[0]?.score ?? 0) - (a.results[0]?.score ?? 0));
}
