import { ImageResponse } from 'next/og';
import { SITE, VERSION } from '@/lib/site';

export const alt = 'Kestrel: htop and pm2 in one terminal app';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// A skyline of CPU bars in the app's colours, like the braille history in the dashboard.
const BARS = [22, 30, 26, 41, 38, 52, 47, 35, 44, 61, 58, 49, 40, 55, 70, 64, 51, 46, 39, 48, 57, 66, 60, 43, 37, 45, 53, 62, 56, 42];

export default function OpenGraphImage() {
    return new ImageResponse(
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#000000', padding: '64px 72px', fontFamily: 'sans-serif', backgroundImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(203,166,247,0.28), transparent 70%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#cdd6f4', letterSpacing: -1 }}>kestrel</div>
                <div style={{ display: 'flex', width: 20, height: 40, background: '#cba6f7' }} />
                <div style={{ display: 'flex', marginLeft: 18, border: '1px solid rgba(203,166,247,0.5)', borderRadius: 999, padding: '6px 16px', color: '#cba6f7', fontSize: 22 }}>v{VERSION} · preview</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, color: '#cdd6f4', letterSpacing: -2, lineHeight: 1.05 }}>htop and pm2, in one terminal app.</div>
                <div style={{ display: 'flex', fontSize: 30, color: '#a6adc8' }}>{SITE.tagline}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', border: '1px solid rgba(205,214,244,0.15)', borderRadius: 14, background: '#121212', padding: '16px 24px', fontSize: 28, color: '#cdd6f4' }}>
                    <span style={{ color: '#cba6f7', marginRight: 16 }}>$</span>npm install -g kestrel-tui
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
                    {BARS.map((v, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative series
                        <div key={i} style={{ display: 'flex', width: 9, height: v * 1.5, borderRadius: 2, background: v >= 60 ? '#fab387' : v >= 45 ? '#f9e2af' : '#a6e3a1' }} />
                    ))}
                </div>
            </div>
        </div>,
        size,
    );
}
