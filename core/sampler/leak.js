// Memory-leak hint for managed processes (BUILD_PLAN §8.5). Pure and advisory: never kills anything.

const MS_PER_MIN = 60000;

const LEAK_DEFAULTS = Object.freeze({
    minSamples: 120, // 10 minutes at one sample per 5 s
    minSlopeMBPerMin: 1,
    minR2: 0.8,
    minGrowth: 0.2, // 20 % over the window
    holdMs: 60000, // keep the flag this long after the last match, so it doesn't flicker
});

/**
 * Least-squares line through the samples.
 * @param {{ at: number, value: number }[]} samples
 * @returns {{ slope: number, intercept: number, r2: number }}  slope in value units per ms
 */
function regression(samples) {
    const n = samples.length;
    const meanX = samples.reduce((s, p) => s + p.at, 0) / n;
    const meanY = samples.reduce((s, p) => s + p.value, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const { at, value } of samples) {
        sxy += (at - meanX) * (value - meanY);
        sxx += (at - meanX) ** 2;
        syy += (value - meanY) ** 2;
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
    return { slope, intercept: meanY - slope * meanX, r2 };
}

function isSteadyGrowth(samples, opts) {
    if (samples.length < opts.minSamples) return false;
    const window = samples.slice(-opts.minSamples);
    const { slope, intercept, r2 } = regression(window);
    const start = intercept + slope * window[0].at;
    const end = intercept + slope * window[window.length - 1].at;
    const growth = start > 0 ? (end - start) / start : 0;
    return slope * MS_PER_MIN >= opts.minSlopeMBPerMin && r2 >= opts.minR2 && growth >= opts.minGrowth;
}

/**
 * @param {{ suspect: boolean, lastMatchAt: number|null }} prev
 * @param {{ at: number, value: number }[]} samples  memory in MB, oldest first
 * @param {number} now
 * @param {Partial<typeof LEAK_DEFAULTS>} [options]
 */
function nextLeakState(prev, samples, now, options = {}) {
    const opts = { ...LEAK_DEFAULTS, ...options };
    if (isSteadyGrowth(samples, opts)) return { suspect: true, lastMatchAt: now };
    const holding = prev.suspect && prev.lastMatchAt !== null && now - prev.lastMatchAt < opts.holdMs;
    return { suspect: holding, lastMatchAt: holding ? prev.lastMatchAt : null };
}

module.exports = { regression, nextLeakState, LEAK_DEFAULTS };
