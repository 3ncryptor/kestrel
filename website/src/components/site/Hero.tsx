import { ChevronDown } from 'lucide-react';
import { HeroGrid } from './HeroGrid';

/** The first screen, and only the name: the grid fills it, like the dashboard fills a terminal. */
export function Hero() {
    return (
        <section className="relative isolate flex h-[100svh] min-h-[560px] flex-col items-center px-4 pt-20 pb-6 sm:px-10">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_45%_at_50%_40%,rgba(166,227,161,0.07),transparent_70%)]"
            />
            <h1 className="flex min-h-0 w-full max-w-[1400px] flex-1 items-center justify-center">
                <span className="sr-only">Kestrel: htop and pm2 in one terminal app</span>
                <HeroGrid className="h-full max-h-full w-full" />
            </h1>
            <p className="mt-6 text-balance text-center text-k-subtext text-lg">htop and pm2, in one terminal app.</p>
            <a
                href="#how-it-works"
                className="mt-5 flex flex-col items-center gap-1 text-[11px] text-k-muted uppercase tracking-[0.3em] transition-colors hover:text-k-text"
            >
                Scroll
                <ChevronDown aria-hidden="true" className="size-4 motion-safe:animate-bounce" />
            </a>
        </section>
    );
}
