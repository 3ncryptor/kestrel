// Address helpers shared by the macOS (lsof) and Linux (ss, /proc/net/tcp) port readers.

/**
 * `127.0.0.1:3000` | `[::1]:5173` | `*:80` | `127.0.0.53%lo:53` → { address, port }, or null.
 * An interface suffix (`%lo`) is dropped.
 */
function parseAddress(text) {
    const match = /^(?:\[([^\]]+)\]|([^:\s[\]]+)):(\d+)$/.exec(text);
    if (!match) return null;
    const address = (match[1] || match[2]).replace(/%.*$/, '');
    return { address, port: Number(match[3]) };
}

/** Eight 16-bit groups → canonical IPv6 text with the longest zero run compressed. */
function formatIpv6(groups) {
    let best = { start: -1, len: 0 };
    let run = { start: -1, len: 0 };
    groups.forEach((g, i) => {
        if (g !== 0) {
            run = { start: -1, len: 0 };
            return;
        }
        run = run.start === -1 ? { start: i, len: 1 } : { start: run.start, len: run.len + 1 };
        if (run.len > best.len) best = run;
    });
    const hex = groups.map((g) => g.toString(16));
    if (best.len < 2) return hex.join(':');
    const head = hex.slice(0, best.start).join(':');
    const tail = hex.slice(best.start + best.len).join(':');
    return `${head}::${tail}`;
}

module.exports = { parseAddress, formatIpv6 };
