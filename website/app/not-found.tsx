import type { Metadata } from 'next';
import Link from 'next/link';
import { TerminalWindow } from '@/components/site/TerminalWindow';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
    return (
        <section className="mx-auto max-w-2xl px-6 pt-36 pb-28">
            <h1 className="mb-8 font-semibold text-3xl text-k-text tracking-tight">Page not found</h1>
            <TerminalWindow title="zsh">
                <div className="font-mono text-sm leading-relaxed">
                    <p className="text-k-text">
                        <span className="text-k-green">$</span> kestrel open this-page
                    </p>
                    <p className="text-k-red">kestrel: no such page (exit 2)</p>
                    <p className="mt-4 text-k-subtext">Try one of these:</p>
                    <ul className="mt-2 space-y-1">
                        {[
                            ['/', 'the home page'],
                            ['/docs', 'the guide'],
                            ['/docs/config', 'the configuration reference'],
                            ['/changelog', 'the changelog'],
                        ].map(([href, label]) => (
                            <li key={href}>
                                <Link href={href as '/'} className="text-k-mauve underline-offset-4 hover:underline">
                                    {href}
                                </Link>{' '}
                                <span className="text-k-muted"># {label}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </TerminalWindow>
        </section>
    );
}
