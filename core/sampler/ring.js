/**
 * Appends `value` and keeps only the newest `capacity` items. Returns a new array; never mutates.
 * @template T
 * @param {T[]} items
 * @param {T} value
 * @param {number} capacity
 * @returns {T[]}
 */
function pushBounded(items, value, capacity) {
    const next = [...items, value];
    return next.length > capacity ? next.slice(next.length - capacity) : next;
}

module.exports = { pushBounded };
