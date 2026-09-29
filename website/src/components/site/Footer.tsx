import Link from 'next/link';
import { LINKS, SITE, VERSION } from '@/lib/site';
import { heroGrid, type Level } from '@/lib/wordmark';
import { GithubMark } from './GithubMark';
import { InstallCommand } from './InstallCommand';
import { Wordmark } from './Nav';
import { PillLink } from './PillLink';

const COLUMNS = [
    {
        title: 'Docs',
        links: [
            { href: '/docs', label: 'Guide' },
            { href: '/docs/config', label: 'Configuration' },
            { href: '/docs/commands', label: 'Commands' },
            { href: '/docs/keys', label: 'Keys' },
            { href: '/changelog', label: 'Changelog' },
        ],
    },
    {
        title: 'Project',
        links: [
            { href: SITE.repo, label: 'GitHub' },
            { href: SITE.npm, label: 'npm' },
            { href: LINKS.releases, label: 'Releases' },
            { href: LINKS.issues, label: 'Report an issue' },
        ],
    },
    {
        title: 'Trust',
        links: [
            { href: LINKS.security, label: 'Security policy' },
            { href: LINKS.license, label: 'MIT licence' },
        ],
    },
] as const;

const PITCH = 10;
const CELL = 8.8;
const MARK = heroGrid(['KESTREL'], 0);
const FILL: Record<Level, string> = { low: 'var(--k-green)', mid: 'var(--k-yellow)', high: 'var(--k-peach)', max: 'var(--k-red)' };

/** The name once more, in the hero's meter cells: dimmed until the pointer passes over it. Decoration. */
function FooterMark() {
    const lit = new Map(MARK.word.map((c) => [`${c.col},${c.row}`, c.level]));
    const rows = MARK.rows - 1; // no graph under it: drop the graph's spacer row
    const rects = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < MARK.cols; col++) {
            const level = lit.get(`${col},${row}`);
            rects.push(
                <rect
                    key={`${col}-${row}`}
                    x={col * PITCH}
                    y={row * PITCH}
                    width={CELL}
                    height={CELL}
                    rx={1.4}
                    className={level ? 'wm-dim' : 'wm-empty wm-faint'}
                    style={level ? { fill: FILL[level] } : undefined}
                />,
            );
        }
    }
    return (
        <svg viewBox={`0 0 ${MARK.cols * PITCH} ${rows * PITCH}`} className="block h-auto w-full" aria-hidden="true" focusable="false">
            {rects}
        </svg>
    );
}

function FooterLink({ href, children }: { href: string; children: string }) {
    const className = 'text-k-subtext transition-colors hover:text-k-text';
    return href.startsWith('/') ? (
        <Link href={href as '/docs'} className={className}>
            {children}
        </Link>
    ) : (
        <a href={href} className={className}>
            {children}
        </a>
    );
}

/** The last screen: the one command to run, where everything is, and the name in meter cells. */
export function Footer() {
    return (
        <footer className="relative isolate overflow-hidden border-white/[0.06] border-t">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(166,227,161,0.07),transparent_70%)]" />

            <div className="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
                <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-end">
                    <div>
                        <p className="text-white/50 text-xs uppercase tracking-[0.32em]">Get started</p>
                        <h2 className="mt-5 text-balance font-bold text-4xl text-k-text tracking-[-0.03em] sm:text-6xl">
                            One command,
                            <br />
                            then <span className="font-mono text-k-green">kestrel</span>.
                        </h2>
                        <p className="mt-5 text-k-subtext text-lg">Free and open source. macOS and Linux, arm64 and x64.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <PillLink href="/docs" variant="primary">
                                Read the guide
                            </PillLink>
                            <PillLink href={SITE.repo}>
                                <GithubMark />
                                Star on GitHub
                            </PillLink>
                        </div>
                    </div>
                    <InstallCommand className="max-w-none" />
                </div>

                <div className="mt-24 grid gap-10 border-white/[0.06] border-t pt-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
                    <div>
                        <Wordmark />
                        <p className="mt-3 max-w-xs text-k-subtext text-sm leading-relaxed">{SITE.tagline}</p>
                        <p className="mt-4 font-mono text-k-muted text-xs">v{VERSION} · no telemetry · MIT</p>
                    </div>
                    {COLUMNS.map((column) => (
                        <nav key={column.title} aria-label={column.title}>
                            <p className="font-medium text-k-text text-sm">{column.title}</p>
                            <ul className="mt-4 space-y-2.5 text-sm">
                                {column.links.map((link) => (
                                    <li key={link.href}>
                                        <FooterLink href={link.href}>{link.label}</FooterLink>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>
            </div>

            <div className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-10">
                <FooterMark />
            </div>

            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-k-muted text-xs">
                <p>© {new Date().getFullYear()} Kestrel · MIT licence</p>
                <a href="#main" className="transition-colors hover:text-k-text">
                    Back to top ↑
                </a>
            </div>
        </footer>
    );
}
