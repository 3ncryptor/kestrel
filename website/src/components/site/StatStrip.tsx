// Three facts, each checkable: the footprint is measured (README "Performance", docs/BUILD_PLAN.md §11), and the
// npm packages declare no install scripts.
const STATS = [
    { value: '1 app', label: 'htop and pm2, together' },
    { value: '~3% CPU', label: 'of one core, full dashboard' },
    { value: '0 scripts', label: 'run when you npm install' },
] as const;

export function StatStrip() {
    return (
        <section aria-label="Kestrel in numbers" className="border-white/[0.06] border-y">
            <dl className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-white/[0.08] px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {STATS.map((s) => (
                    <div key={s.value} className="flex flex-col items-center gap-1 py-8 text-center">
                        <dt className="order-2 text-k-muted text-sm">{s.label}</dt>
                        <dd className="order-1 font-bold text-3xl text-k-text tracking-tight">{s.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
