import { AnimatedLink } from '@/components/ui/animated-button';
import { InstallCommand } from './InstallCommand';

export function ClosingCta() {
    return (
        <section aria-labelledby="start-title" className="relative isolate overflow-hidden py-28">
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(203,166,247,0.16),transparent_70%)]" />
            <div className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
                <h2 id="start-title" className="text-balance font-semibold text-3xl text-k-text tracking-tight sm:text-5xl">
                    One command, then <span className="font-mono text-k-mauve">kestrel</span>.
                </h2>
                <p className="mt-5 text-lg">Free and open source, MIT-licensed. macOS and Linux.</p>
                <InstallCommand className="mt-10" />
                <div className="mt-8">
                    <AnimatedLink href="/docs" variant="primary" showArrow>
                        Read the guide
                    </AnimatedLink>
                </div>
            </div>
        </section>
    );
}
