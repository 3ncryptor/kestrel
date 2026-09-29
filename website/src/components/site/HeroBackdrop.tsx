'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// The WebGL grain is decoration: it loads only after hydration, on a desktop-class device, without
// reduced motion. Everywhere else a static gradient (the CSS below) stands in.
const Grainient = dynamic(() => import('@/components/ui/dither').then((m) => m.Grainient), { ssr: false });

const MIN_CORES = 4;

function canAnimate() {
    const fine = window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return fine && !calm && (navigator.hardwareConcurrency ?? 0) >= MIN_CORES;
}

export function HeroBackdrop() {
    const [webgl, setWebgl] = useState(false);
    useEffect(() => setWebgl(canAnimate()), []);

    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(203,166,247,0.18),transparent_70%),radial-gradient(ellipse_40%_40%_at_80%_30%,rgba(137,180,250,0.12),transparent_70%)]" />
            {webgl && (
                <div className="absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,black,transparent_75%)]">
                    <Grainient color1="#cba6f7" color2="#1e1b2e" color3="#89b4fa" timeSpeed={0.12} warpStrength={0.9} grainAmount={0.08} contrast={1.15} saturation={0.9} zoom={0.9} />
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-k-base" />
        </div>
    );
}
