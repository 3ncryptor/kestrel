import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { ScrollMeter } from '@/components/motion/ScrollMeter';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { Footer } from '@/components/site/Footer';
import { Nav } from '@/components/site/Nav';
import { QuitEgg } from '@/components/site/QuitEgg';
import { SiteShortcuts } from '@/components/site/SiteShortcuts';
import { Toaster } from '@/components/ui/sonner';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
    metadataBase: new URL(SITE.url),
    title: { default: `${SITE.name}: htop and pm2 in one terminal app`, template: `%s · ${SITE.name}` },
    description: SITE.description,
    applicationName: SITE.name,
    keywords: ['terminal', 'tui', 'system monitor', 'process manager', 'htop', 'btop', 'pm2', 'foreman', 'macOS', 'Linux'],
    openGraph: { type: 'website', siteName: SITE.name, url: '/', title: `${SITE.name}: htop and pm2 in one terminal app`, description: SITE.description },
    twitter: { card: 'summary_large_image', title: `${SITE.name}: htop and pm2 in one terminal app`, description: SITE.description },
    alternates: { canonical: '/' },
    icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
    // The text face sets the headline (the largest paint), so fetch it with the HTML rather than after the CSS.
    preload('/fonts/plus-jakarta-sans.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
    return (
        <html lang="en" className="dark">
            <body className="min-h-dvh font-sans">
                <a
                    href="#main"
                    className="sr-only rounded-md bg-k-mauve px-3 py-2 font-medium text-k-base focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
                >
                    Skip to content
                </a>
                <Nav />
                <main id="main">{children}</main>
                <Footer />
                <Toaster theme="dark" position="bottom-center" />
                <SiteShortcuts />
                <QuitEgg />
                <SmoothScroll />
                <ScrollMeter />
            </body>
        </html>
    );
}
