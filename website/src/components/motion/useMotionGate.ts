'use client';

import { useSyncExternalStore } from 'react';

// One answer, site-wide, to "how much motion may this page make?":
// - `motion`: scroll smoothing, text reveals, pinning, magnetic hover. Off under prefers-reduced-motion, or when
//   the visitor turned effects off in the project menu.
// - `rich`: the canvas and WebGL decoration too (grain, light fields). Also off on low-power devices.
// The server (and the first client render) says "off", so hydration always matches and motion is an enhancement.

const EFFECTS_KEY = 'kestrel:effects';
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;
const REDUCED = '(prefers-reduced-motion: reduce)';

export interface MotionGate {
    motion: boolean;
    rich: boolean;
}

const OFF: MotionGate = { motion: false, rich: false };
const listeners = new Set<() => void>();
let cached: MotionGate | null = null;

function readEffectsOn(): boolean {
    try {
        return window.localStorage.getItem(EFFECTS_KEY) !== 'off';
    } catch {
        return true;
    }
}

function isLowPower(): boolean {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    return (nav.hardwareConcurrency ?? MIN_CORES) < MIN_CORES || (nav.deviceMemory ?? MIN_MEMORY_GB) < MIN_MEMORY_GB || nav.connection?.saveData === true;
}

function compute(): MotionGate {
    const motion = !window.matchMedia(REDUCED).matches && readEffectsOn();
    return { motion, rich: motion && !isLowPower() };
}

function notify() {
    cached = null;
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const media = window.matchMedia(REDUCED);
    media.addEventListener('change', notify);
    window.addEventListener('storage', notify);
    return () => {
        listeners.delete(listener);
        media.removeEventListener('change', notify);
        window.removeEventListener('storage', notify);
    };
}

function snapshot(): MotionGate {
    cached ??= compute();
    return cached;
}

export function useMotionGate(): MotionGate {
    return useSyncExternalStore(subscribe, snapshot, () => OFF);
}

export function effectsEnabled(): boolean {
    return readEffectsOn();
}

/** The project menu's "Effects" switch. Remembered in this browser only. */
export function setEffectsEnabled(on: boolean) {
    try {
        if (on) window.localStorage.removeItem(EFFECTS_KEY);
        else window.localStorage.setItem(EFFECTS_KEY, 'off');
    } catch {
        // Storage can be blocked (private windows); the switch still applies until reload.
    }
    notify();
}
