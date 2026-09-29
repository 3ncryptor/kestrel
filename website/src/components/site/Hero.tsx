import { AnimatedLink } from '@/components/ui/animated-button';
import { firstStandardFrame } from '@/lib/hero-data';
import { SITE } from '@/lib/site';
import { HeroBackdrop } from './HeroBackdrop';
import { HeroPlayer } from './HeroPlayer';
import { InstallCommand } from './InstallCommand';
import { RiseText } from './RiseText';

export async function Hero() {
    const initial = await firstStandardFrame();
    return (
        <section className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40">
            <HeroBackdrop />
            <div className="mx-auto flex max-w-6xl flex-col items-center px-6 text-center">
                <p className="mb-6 font-mono text-k-teal text-xs uppercase tracking-[0.2em]">system monitor · process manager · one binary</p>
                <RiseText as="h1" text="htop and pm2, in one terminal app." className="max-w-4xl text-balance font-semibold text-4xl text-k-text tracking-tight sm:text-6xl" />
                <p className="mt-6 max-w-2xl text-balance text-lg leading-relaxed">
                    Kestrel shows what is using your machine and runs your project’s processes, on one screen. So it can tell you that{' '}
                    <em className="text-k-text not-italic">your</em> <code className="font-mono text-k-teal">api</code> is the process holding
                    1.2 GB and climbing, and which port it listens on.
                </p>
                <InstallCommand className="mt-10" />
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <AnimatedLink href="/docs" variant="primary" showArrow>
                        Get started
                    </AnimatedLink>
                    <AnimatedLink href={SITE.repo} variant="shimmer">
                        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                        Star on GitHub
                    </AnimatedLink>
                </div>
            </div>
            <div className="mx-auto mt-16 max-w-5xl px-3 sm:px-6">
                <HeroPlayer initial={initial} />
            </div>
        </section>
    );
}
