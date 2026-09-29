import { ClosingCta } from '@/components/site/ClosingCta';
import { DashboardTour } from '@/components/site/DashboardTour';
import { Faq } from '@/components/site/Faq';
import { Features } from '@/components/site/Features';
import { Hero } from '@/components/site/Hero';
import { MergeCards } from '@/components/site/MergeCards';
import { Numbers } from '@/components/site/Numbers';
import { Platforms } from '@/components/site/Platforms';
import { QuickStart } from '@/components/site/QuickStart';
import { Section } from '@/components/site/Section';
import { StackExplorer } from '@/components/site/StackExplorer';
import { Trust } from '@/components/site/Trust';
import { standardFrame } from '@/lib/hero-data';

/** Frame 13 of the replay: the worker's retry countdown, so the tour has the most to show. */
const TOUR_FRAME = 13;

export default async function Home() {
    const tourFrame = await standardFrame(TOUR_FRAME);
    return (
        <>
            <Hero />
            <Section id="tour" eyebrow="A tour" title="Everything on one screen" lead="The same frame as above, stopped at the moment the worker crashed. Scroll through what each part tells you.">
                <DashboardTour frame={tourFrame} />
            </Section>
            <Section id="why" eyebrow="Why one app" title="Two tools, each seeing half the picture" lead="A system monitor sees every process but not which are yours. A process manager runs yours but can’t see the machine. Kestrel does both, so it can connect them.">
                <MergeCards />
            </Section>
            <Section id="features" eyebrow="Features" title="Built for the terminal you already live in">
                <Features />
                <div className="mt-6">
                    <Numbers />
                </div>
            </Section>
            <Section id="start" eyebrow="Get going" title="From install to your stack in 30 seconds" lead="The commands and their output below are the real ones.">
                <QuickStart />
            </Section>
            <Section id="stack" eyebrow="kestrel.json" title="Describe your stack once" lead="Hover a key to see what it does. A Procfile or your package.json scripts work too, without any config.">
                <StackExplorer />
            </Section>
            <Section id="trust" eyebrow="Trust" title="Verifiable from npm to your machine">
                <Trust />
            </Section>
            <Section id="platforms" eyebrow="Platforms" title="macOS and Linux, arm64 and x64">
                <Platforms />
            </Section>
            <Section id="faq" eyebrow="FAQ" title="Questions people ask">
                <Faq />
            </Section>
            <ClosingCta />
        </>
    );
}
