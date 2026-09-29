import Link from 'next/link';
import { INSTALL, LINKS, SITE, VERSION } from '@/lib/site';
import { CopyButton } from './CopyButton';
import { Wordmark } from './Nav';

const COLUMNS = [
    {
        title: 'Docs',
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
            { href: SITE.repo, label: 'GitHub' },
            { href: SITE.npm, label: 'npm' },
            { href: LINKS.releases, label: 'Releases' },
            { href: '/changelog', label: 'Changelog' },
        ],
    },
    {
        title: 'Trust',
        links: [
            { href: LINKS.security, label: 'Security' },
            { href: LINKS.license, label: 'Licence' },
            { href: LINKS.issues, label: 'Issues' },
        ],
    },
] as const;

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

/** Minimal: the name and the one command, three short columns, and a single line under them. */
export function Footer() {
    return (
        <footer className="border-white/[0.06] border-t">
            <div className="mx-auto max-w-6xl px-6 pt-16 pb-8">
                <div className="flex flex-col justify-between gap-12 md:flex-row">
                    <div className="max-w-sm">
                        <Wordmark />
                        <p className="mt-4 text-k-subtext text-sm leading-relaxed">{SITE.tagline}</p>
                        <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] py-1 pr-1 pl-4">
                            <code className="min-w-0 flex-1 truncate font-mono text-k-text text-xs">
                                <span aria-hidden="true" className="text-k-green">
                                    ${' '}
                                </span>
                                {INSTALL.npm}
                            </code>
                            <CopyButton text={INSTALL.npm} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-12 gap-y-8 text-sm sm:gap-x-20">
                        {COLUMNS.map((column) => (
                            <nav key={column.title} aria-label={column.title}>
                                <p className="text-k-muted text-xs uppercase tracking-[0.2em]">{column.title}</p>
                                <ul className="mt-4 space-y-2.5">
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

                <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-white/[0.06] border-t pt-6 font-mono text-k-muted text-xs">
                    <p>
                        © {new Date().getFullYear()} kestrel · MIT · v{VERSION} · no telemetry
                    </p>
                    <a href="#main" className="transition-colors hover:text-k-text">
                        back to top ↑
                    </a>
                </div>
            </div>
        </footer>
    );
}
