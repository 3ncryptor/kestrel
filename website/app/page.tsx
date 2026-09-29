import { Faq } from '@/components/site/Faq';
import { Features } from '@/components/site/Features';
import { Hero } from '@/components/site/Hero';
import { HowItWorks } from '@/components/site/HowItWorks';
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
            <Section id="features" eyebrow="Features" title="Built for the terminal you already live in">
                <Features />
            </Section>
            <Section id="stack" eyebrow="kestrel.json" title="Describe your stack once" lead="Hover a key to see what it does. A Procfile or your package.json scripts work too, without any config.">
                <StackExplorer />
            </Section>
            <Section id="trust" eyebrow="Trust" title="Verifiable from npm to your machine">
                <Trust />
            </Section>
            <Section id="platforms" eyebrow="Packages" title="macOS and Linux, arm64 and x64">
                <Platforms />
            </Section>
            <Section id="faq" eyebrow="FAQ" title="Questions people ask">
                <Faq />
            </Section>
        </>
    );
}
