import { ClosingCta } from '@/components/site/ClosingCta';
import { Faq } from '@/components/site/Faq';
import { Features } from '@/components/site/Features';
import { Hero } from '@/components/site/Hero';
import { HowItWorks } from '@/components/site/HowItWorks';
import { MergeCards } from '@/components/site/MergeCards';
import { Numbers } from '@/components/site/Numbers';
import { Platforms } from '@/components/site/Platforms';
import { Section } from '@/components/site/Section';
import { StackExplorer } from '@/components/site/StackExplorer';
import { StatStrip } from '@/components/site/StatStrip';
import { Trust } from '@/components/site/Trust';
import { CRASH_STILL, firstStandardFrame, standardFrame } from '@/lib/hero-data';

export default async function Home() {
    const [initial, crashStill] = await Promise.all([firstStandardFrame(), standardFrame(CRASH_STILL)]);
    return (
        <>
            <Hero />
            <StatStrip />
            <HowItWorks initial={initial} crashStill={crashStill} />
            <Section id="why" eyebrow="Why one app" title="Two tools, each seeing half the picture" lead="A system monitor sees every process but not which are yours. A process manager runs yours but can’t see the machine. Kestrel does both, so it can connect them.">
                <MergeCards />
            </Section>
            <Section id="features" eyebrow="Features" title="Built for the terminal you already live in">
                <Features />
                <div className="mt-6">
                    <Numbers />
                </div>
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
