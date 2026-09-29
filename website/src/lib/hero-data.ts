import compact from '@/generated/hero-compact.json';
import mono from '@/generated/hero-mono.json';
import wide from '@/generated/hero-wide.json';
import { decodeAll, decodeFirst, type EncodedFrames, type Frame } from '@/lib/frames';

// The generated JSON is typed too loosely for EncodedFrames; scripts/website/generate.jsx guarantees the
// shape, and tests/unit/frames.test.ts checks it.
const asFrames = (data: unknown) => data as EncodedFrames;

/** The single-frame views behind the hero's width and colour controls (small, so they ship with the page). */
export const STILLS: Record<'compact' | 'wide' | 'mono', Frame> = {
    compact: decodeFirst(asFrames(compact)),
    wide: decodeFirst(asFrames(wide)),
    mono: decodeFirst(asFrames(mono)),
};

/** The 30 animated frames, loaded after the page is interactive (a separate chunk). */
export async function loadStandardFrames(): Promise<EncodedFrames> {
    const module = await import('@/generated/hero-standard.json');
    return asFrames(module.default);
}

export async function firstStandardFrame(): Promise<Frame> {
    return decodeFirst(await loadStandardFrames());
}

/** One frame of the replay, in full (server side; frame 13 shows the worker's retry countdown). */
export async function standardFrame(index: number): Promise<Frame> {
    const frames = decodeAll(await loadStandardFrames());
    const frame = frames[index];
    if (!frame) throw new Error(`the hero has ${frames.length} frames, not ${index + 1}`);
    return frame;
}
