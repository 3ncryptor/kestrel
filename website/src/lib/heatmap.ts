// Pure helpers behind the commit heatmap. The heatmap only ever draws the days it is given: there is no generator
// here on purpose (the vendored component invented random activity when it had no data).

export interface Day {
    /** `YYYY-MM-DD`, in UTC. */
    date: string;
    count: number;
}

export type Level = 0 | 1 | 2 | 3 | 4;
export type Week = Array<Day | undefined>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAYS_PER_WEEK = 7;
/** A month label needs at least this many weeks of room, or it would overlap the next one. */
const MIN_LABEL_WEEKS = 2;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** 0 for no commits, then 1–4 in quarters of the busiest day, like GitHub's own scale. */
export function levelFor(count: number, max: number): Level {
    if (count <= 0 || max <= 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as Level;
}

/** Days grouped into Sunday-first weeks (columns), padded with `undefined` so every week has seven cells. */
export function weeksOf(days: readonly Day[]): Week[] {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    if (!first) return [];
    const padded: Week = [...Array<undefined>(utc(first.date).getUTCDay()).fill(undefined), ...sorted];
    const weeks: Week[] = [];
    for (let i = 0; i < padded.length; i += DAYS_PER_WEEK) {
        const week = padded.slice(i, i + DAYS_PER_WEEK);
        weeks.push([...week, ...Array<undefined>(DAYS_PER_WEEK - week.length).fill(undefined)]);
    }
    return weeks;
}

/** Where each month's label goes: the first week that starts in it, with no label squeezed in at an edge. */
export function monthLabels(weeks: readonly Week[]): Array<{ week: number; label: string }> {
    const labels: Array<{ week: number; label: string }> = [];
    weeks.forEach((week, index) => {
        const day = week.find((d) => d !== undefined);
        if (!day) return;
        const label = MONTHS[utc(day.date).getUTCMonth()] ?? '';
        if (labels.at(-1)?.label !== label) labels.push({ week: index, label });
    });
    return labels.filter(({ week }, i) => {
        const next = labels[i + 1]?.week ?? weeks.length;
        return next - week >= MIN_LABEL_WEEKS;
    });
}

export function formatDay(date: string): string {
    const d = utc(date);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** The numbers the heatmap states in words (its text alternative). */
export function summarize(days: readonly Day[]): { total: number; activeDays: number; busiest: Day | undefined } {
    let busiest: Day | undefined;
    let total = 0;
    let activeDays = 0;
    for (const day of days) {
        total += day.count;
        if (day.count > 0) activeDays++;
        if (!busiest || day.count > busiest.count) busiest = day;
    }
    return { total, activeDays, busiest: busiest && busiest.count > 0 ? busiest : undefined };
}
