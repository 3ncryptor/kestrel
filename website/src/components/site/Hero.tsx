import { firstStandardFrame } from '@/lib/hero-data';
import { SITE } from '@/lib/site';
import { GithubMark } from './GithubMark';
import { HeroPlayer } from './HeroPlayer';
import { InstallCommand } from './InstallCommand';
import { MeterWordmark } from './MeterWordmark';
import { PillLink } from './PillLink';

export async function Hero() {
    const initial = await firstStandardFrame();
    return (
        <section className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_40%_at_50%_18%,rgba(166,227,161,0.09),transparent_70%)]"
            />
            <div className="mx-auto flex max-w-6xl flex-col items-center px-4 text-center sm:px-6">
                <h1 className="w-full">
                    <span className="sr-only">Kestrel: htop and pm2 in one terminal app</span>
                    <MeterWordmark />
                </h1>
                <p className="mt-10 text-balance text-k-subtext text-lg sm:text-xl">htop and pm2, in one terminal app.</p>
                <InstallCommand className="mt-8" />
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <PillLink href="/docs" variant="primary">
                        Get started
                    </PillLink>
                    <PillLink href={SITE.repo}>
                        <GithubMark />
                        GitHub
                    </PillLink>
                </div>
            </div>
            <div className="mx-auto mt-20 max-w-5xl px-3 sm:px-6">
                <HeroPlayer initial={initial} />
            </div>
        </section>
    );
}
