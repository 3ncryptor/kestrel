// Type definitions for the platform adapter contract (BUILD_PLAN §7). No runtime code.

/**
 * @typedef {'running'|'sleeping'|'idle'|'stopped'|'waiting'|'zombie'|'dead'|'unknown'} ProcessState
 */

/**
 * One OS process as reported by an adapter. Exactly one of `cpuPercent` (from ps) or `cpuTicks`
 * (cumulative CPU time: Linux /proc, native macOS) is set; the sampler turns either into `cpu`.
 * @typedef {Object} ProcessInfo
 * @property {number} pid
 * @property {number} ppid
 * @property {string} name        Short executable name
 * @property {string} command     Full path or command line
 * @property {string} user
 * @property {ProcessState} state
 * @property {number} rssKB       Resident memory
 * @property {number|null} startedAt  Epoch ms
 * @property {number} [cpuPercent]
 * @property {number} [cpuTicks]
 */

/**
 * @typedef {Object} MemoryInfo
 * @property {number} totalMB
 * @property {number} usedMB
 * @property {number} cachedMB   reclaimable file cache
 * @property {number} swapUsedMB
 * @property {number} swapTotalMB
 */

/**
 * @typedef {Object} PortInfo
 * @property {number} port
 * @property {string} address   '*', '::', '127.0.0.1', '::1', …
 * @property {'tcp'} proto
 * @property {number|null} pid  null when the owner is hidden (not root)
 * @property {string|null} name
 */

/**
 * @typedef {Object} PortsResult
 * @property {PortInfo[]} items
 * @property {boolean} partial  true when owners of other users' sockets may be missing
 */

/**
 * Cumulative per-core CPU time in ms (shape of `os.cpus()[n].times`).
 * @typedef {Object} CpuTimes
 * @property {number} user
 * @property {number} nice
 * @property {number} sys
 * @property {number} idle
 * @property {number} irq
 */

/**
 * @typedef {Object} PlatformAdapter
 * @property {'darwin'|'linux'} id
 * @property {() => Promise<ProcessInfo[]>} listProcesses
 * @property {() => Promise<MemoryInfo>} memory
 * @property {() => Promise<PortsResult>} listeningPorts
 * @property {() => CpuTimes[]} cpuTimes
 * @property {() => number[]} loadAverage
 * @property {number} [clockTicks]  units of cpuTicks per second (Linux: USER_HZ; native macOS: 1e9, ns)
 * @property {'native'|'ps'} [sampling]  macOS: libproc via FFI, or the ps/lsof fallback (M4)
 */

/**
 * Promise-returning `execFile` (no shell). Rejections carry `code` and `stdout` like Node's.
 * @typedef {(file: string, args: string[]) => Promise<{ stdout: string }>} ExecFn
 */

module.exports = {};
