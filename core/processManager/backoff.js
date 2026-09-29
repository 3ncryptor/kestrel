const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/** attempt 1 → 1 s, 2 → 2 s, 3 → 4 s … capped at 30 s (PRD P2). */
function computeDelay(attempt, { base = BASE_DELAY_MS, max = MAX_DELAY_MS } = {}) {
    const n = Math.max(1, Math.floor(attempt));
    return Math.min(base * 2 ** (n - 1), max);
}

module.exports = { computeDelay, BASE_DELAY_MS, MAX_DELAY_MS };
