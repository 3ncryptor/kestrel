import Link from 'next/link';
import { LINKS, SITE, VERSION } from '@/lib/site';
import { Wordmark } from './Nav';

const COLUMNS = [
    {
        title: 'Product',
        links: [
            { href: '/docs', label: 'Guide' },
            { href: '/docs/config', label: 'Configuration' },
            { href: '/docs/commands', label: 'Commands' },
            { href: '/docs/keys', label: 'Keys' },
        ],
    },
    {
        title: 'Project',
        links: [
            { href: '/changelog', label: 'Changelog' },
            { href: SITE.repo, label: 'GitHub' },
            { href: SITE.npm, label: 'npm' },
            { href: LINKS.releases, label: 'Releases' },
        ],
    },
    {
        title: 'Trust',
        links: [
            { href: LINKS.security, label: 'Security policy' },
            { href: LINKS.license, label: 'MIT licence' },
            { href: LINKS.issues, label: 'Report an issue' },
        ],
    },
] as const;

export function Footer() {
    return (
        <footer className="border-white/[0.06] border-t">
            <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
                <div>
                    <Wordmark />
                    <p className="mt-3 max-w-xs text-sm">{SITE.tagline}</p>
                    <p className="mt-4 font-mono text-k-overlay0 text-xs">
                        v{VERSION} · no telemetry · MIT
                    </p>
                </div>
                {COLUMNS.map((column) => (
                    <div key={column.title}>
                        <h2 className="font-medium text-k-text text-sm">{column.title}</h2>
                        <ul className="mt-3 space-y-2 text-sm">
                            {column.links.map((link) => (
                                <li key={link.href}>
                                    {link.href.startsWith('/') ? (
                                        <Link href={link.href as '/docs'} className="transition-colors hover:text-k-text">
                                            {link.label}
                                        </Link>
                                    ) : (
                                        <a href={link.href} className="transition-colors hover:text-k-text">
                                            {link.label}
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </footer>
    );
}
