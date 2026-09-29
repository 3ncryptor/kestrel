// The store contract (BUILD_PLAN §6.1) as types. Frozen at the end of M1: changing it is a deliberate
// act checked by tests/unit/contract.test.js. No runtime code.

/** @typedef {'ok'|'warn'|'danger'} Level */

/**
 * @typedef {Object} Meta
 * @property {string} version
 * @property {string} platform
 * @property {string} arch
 * @property {string} hostname
 * @property {boolean} isRoot
 * @property {number} startedAt
 * @property {string|null} configPath
 * @property {'kestrel.json'|'Procfile'|'package.json'|null} configSource
 */

/**
 * @typedef {Object} Thresholds
 * @property {number[]} cpu    [warn, danger] in % of one core
 * @property {number[]} memMB  [warn, danger]
 */

/**
 * @typedef {Object} SystemStats
 * @property {number|null} cpuPercent  null until the second tick (no baseline yet)
 * @property {number[]} cores
 * @property {number[]} load
 * @property {number|null} memUsedMB
 * @property {number|null} memTotalMB
 * @property {number|null} memCachedMB  file cache (reclaimable), for the mem box (M2b)
 * @property {number|null} swapUsedMB
 * @property {number|null} swapTotalMB  (M2b)
 * @property {number} uptimeSec
 */

/**
 * @typedef {import('../sampler/cpu').SampledProcess & {
 *   managedId: string|null, level: Level,
 *   depth?: number, hasChildren?: boolean, collapsed?: boolean, descendantCount?: number
 * }} ProcessRow
 */

/** @typedef {import('../platform/types').PortInfo & { managedId: string|null }} PortRow */

/**
 * @typedef {Object} Resources
 * @property {number} cpu
 * @property {number} memMB
 * @property {number} procCount
 */

/**
 * @typedef {Object} ManagedEntry
 * @property {string} id
 * @property {string|null} cmd
 * @property {string|null} cwd
 * @property {string} status
 * @property {number|null} pid
 * @property {number|null} startedAt
 * @property {number} restartCount
 * @property {number|null} exitCode
 * @property {string|null} signal
 * @property {number|null} nextRestartAt
 * @property {'on-failure'|'always'|'never'} restart
 * @property {{ kind: string, target: string|number, ok: boolean }|null} ready
 * @property {string[]} blockedBy  dependencies that failed, while status is "blocked"
 * @property {Resources|null} resources
 * @property {{ at: number, value: number }[]} memHistory
 * @property {boolean} leakSuspect
 * @property {string[]} dependsOn
 * @property {number} logCount
 */

/**
 * @typedef {Object} Alert
 * @property {string} id
 * @property {'warn'|'danger'} level
 * @property {string} source
 * @property {string} message
 * @property {number} at
 */

/**
 * @typedef {Object} UiState
 * @property {'dashboard'} screen
 * @property {'table'|'tree'} monitorView
 * @property {'proc'|'managed'|'ports'} focus  the focused dashboard box (M2b; managed in M3)
 * @property {number|null} selectedPid
 * @property {'cpu'|'mem'|'pid'|'name'|'user'} sortBy
 * @property {'asc'|'desc'} sortDir
 * @property {string} filterQuery
 * @property {number[]} collapsedPids
 * @property {string|null} selectedManagedId
 * @property {string} logFilter
 * @property {boolean} logFollow
 * @property {{ level: string, message: string, at: number }|null} toast
 */

/**
 * The project's stack (M3). `scripts` lists package.json candidates for the first-run picker.
 * @typedef {Object} StackState
 * @property {string|null} name    folder name of the config
 * @property {'kestrel.json'|'Procfile'|'package.json'|null} source
 * @property {string|null} path
 * @property {{ path: string, message: string }[]} errors  an invalid config: nothing is registered
 * @property {string[]} warnings
 * @property {{ name: string, command: string, preselected: boolean }[]|null} scripts
 * @property {'idle'|'starting'|'running'|'stopping'|'stopped'} phase
 * @property {Record<string, 'stopping'|'stopped'>} stopProgress  per process, while the stack stops
 */

/**
 * A child a previous Kestrel started and left running (it was killed hard). Verified by start time.
 * @typedef {{ id: string, pid: number, pgid: number, startedAt: number }} Orphan
 */

/**
 * @typedef {Object} KestrelState
 * @property {Meta} meta
 * @property {{ thresholds: Thresholds }} settings
 * @property {SystemStats} system
 * @property {{ cpu: number[], mem: number[] }} history   last 240 samples, % values
 * @property {ProcessRow[]} processes                      already filtered, sorted and tagged
 * @property {ProcessRow[]} topConsumers                   top 5 by CPU, unfiltered (Overview; added in M2)
 * @property {{ items: PortRow[], partial: boolean, updatedAt: number|null }} ports
 * @property {ManagedEntry[]} managed
 * @property {StackState} stack
 * @property {Orphan[]} orphans
 * @property {Alert[]} alerts
 * @property {UiState} ui
 * @property {Record<string, { message: string, at: number }>} errors  per data source
 */

module.exports = {};
