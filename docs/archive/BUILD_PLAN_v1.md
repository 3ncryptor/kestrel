# Kestrel — Technical Design & Build Plan

Kestrel is a terminal-based system monitor and process manager for macOS, combining live system observability (in the style of `htop`/`btop`) with process lifecycle management (in the style of `pm2`) in a single tool.

---

## 1. Overview

Terminal system monitors provide visibility into running processes but no control over process lifecycles beyond signaling. Process managers provide lifecycle control (spawn, restart, log capture) but typically operate independently of system-wide monitoring. Kestrel combines both capabilities in a single application backed by one shared data store: a live view of system resource usage and the full OS process table, alongside a managed-process panel for processes spawned and supervised by the application itself.

## 2. Product Definition

Kestrel operates in two modes, both reading from a single shared state store:

- **Monitor Mode** — displays live CPU and memory usage alongside the system process table. Supports sorting, filtering, process selection, and termination or priority adjustment of selected processes.
- **Manager Mode** — allows the user to launch and supervise child processes. Tracks PID, uptime, restart count, and status for each managed process; automatically restarts crashed processes using exponential backoff; captures and displays live stdout/stderr output per process.

### Current scope
- Target platform: macOS only.
- Single-machine, local monitoring and process management only.

### Out of scope for the current milestone
- Linux and Windows support (see Section 10, Future Work).
- Remote or networked monitoring.
- Persistence of managed-process configuration across application restarts.
- Disk and network I/O visualization.

## 3. Architecture Principles

- **Separation of engine and presentation.** The core logic (data collection, process management, system control) has no dependency on any UI framework. It exposes a single, well-defined state store and event interface. This is consistent with a ports-and-adapters (hexagonal) architecture: the presentation layer can be replaced without modifying core logic.
- **Manual implementation of core logic.** All modules under `core/` — data collection, parsing, process lifecycle management, and system control — are implemented manually. The UI layer (`ui/`), built with OpenTUI and React, is developed with AI-assisted scaffolding against the fixed store/actions interface described in Section 6.
- **Deterministic, testable core.** Core modules are designed to be unit-testable independent of the running operating system state, using fixture data for parsing logic and disposable child processes for lifecycle logic.

## 4. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js (JavaScript, CommonJS) | Consistent with prior coursework; no additional tooling required |
| Process control | Node's built-in `child_process` module (`exec`, `spawn`) | Sufficient for all process observation and control requirements |
| State/event layer | Node's built-in `EventEmitter` | Avoids external state-management dependencies in the core |
| UI | OpenTUI with React | Terminal UI framework; consumes the core's store interface exclusively |
| Testing | Node's built-in `node:test` module | No additional test framework dependency |
| Package manager | npm | Standard tooling |

The `core/` directory does not depend on React, OpenTUI, or any rendering library.

## 5. Repository Structure

```
kestrel/
├── core/
│   ├── collector/
│   │   ├── index.js             # Public API: getSystemStats(), getProcessList()
│   │   └── macos.js              # macOS-specific data collection and parsing
│   ├── processManager/
│   │   ├── index.js             # Process spawning, monitoring, and restart logic
│   │   ├── logBuffer.js          # Bounded log buffer per managed process
│   │   └── backoff.js            # Exponential backoff calculation for restarts
│   ├── systemControl/
│   │   └── index.js             # Process termination and priority adjustment
│   ├── store/
│   │   └── index.js             # Central state store and event emitter (UI contract)
│   └── actions/
│       └── index.js             # Public action functions consumed by the UI layer
├── ui/                           # OpenTUI/React presentation layer
├── tests/
│   ├── collector.test.js
│   ├── processManager.test.js
│   └── systemControl.test.js
├── docs/
│   └── KESTREL_BUILD_PLAN.md
├── scripts/
│   └── dummy-worker.js           # Test fixture process for process manager development
├── package.json
└── index.js                      # Application entry point
```

## 6. Core Architecture: The Store Interface

The store is the sole interface between the core engine and the presentation layer. The UI layer reads state and subscribes to events from the store; it does not invoke `child_process` or any OS-level API directly.

### State shape

```js
store.state = {
  system: {
    cpuPercent: 42.3,
    memUsedMB: 8213,
    memTotalMB: 16384,
    uptimeSec: 134221,
    platform: "darwin"
  },
  processes: [
    { pid: 1234, name: "node", cpu: 3.2, mem: 120, status: "running", user: "example" }
  ],
  managed: [
    {
      id: "worker-1",
      cmd: "node scripts/dummy-worker.js",
      pid: 5678,
      status: "running",
      startedAt: 1725900000000,
      restartCount: 2,
      logs: ["line 1", "line 2"]
    }
  ],
  ui: {
    selectedPid: 1234,
    sortBy: "cpu",
    filterQuery: ""
  }
}
```

### Emitted events

| Event | Payload | Emitted when |
|---|---|---|
| `stats:update` | `system` object | On each polling interval |
| `processes:update` | `processes` array | On each polling interval |
| `managed:started` | Managed process metadata | When a managed process is spawned |
| `managed:crashed` | `{ id, exitCode, signal }` | When a managed process exits unexpectedly |
| `managed:restarting` | `{ id, attempt, delayMs }` | During the backoff period preceding a restart |
| `managed:log` | `{ id, line }` | On new stdout/stderr output from a managed process |
| `managed:killed` | `{ id }` | When a managed process is manually terminated |

## 7. Implementation Guide

This section describes the recommended implementation sequence. Each step specifies the module to implement, the relevant Node.js APIs, and a verification method to confirm correct behavior before proceeding.

### Step 1: Project initialization

```
mkdir kestrel && cd kestrel
npm init -y
mkdir -p core/collector core/processManager core/systemControl core/store core/actions scripts tests
```

### Step 2: System data collection (`core/collector/macos.js`)

Relevant APIs: `child_process.execSync`, `os.uptime()`.

Data sources: `top -l 1 -n 0` for CPU and memory usage; `ps -A -o pid,comm,pcpu,pmem,user` for the process table; `sysctl hw.memsize` for total physical memory.

Implementation should inspect the raw output of these commands directly before writing parsing logic, as output format varies by macOS version.

Module interface:

```js
function getSystemStats() {
  // Returns { cpuPercent, memUsedMB, memTotalMB, uptimeSec, platform }
}

function getProcessList() {
  // Returns an array of { pid, name, cpu, mem, user, status }
}

module.exports = { getSystemStats, getProcessList };
```

**Verification:** Output of `getSystemStats()` and `getProcessList()` should reflect current system state and be comparable to values shown in Activity Monitor.

### Step 3: Polling loop

Wrap the collector functions in a `setInterval` loop (recommended interval: 1500ms) and confirm that values update over time under varying system load, prior to integrating with the store.

### Step 4: Central state store (`core/store/index.js`)

Relevant API: the `events` module, extending `EventEmitter`.

The store maintains `state` as described in Section 6 and emits `stats:update` and `processes:update` on each polling interval. Sorting and filtering (based on `state.ui.sortBy` and `state.ui.filterQuery`) should be applied before storing the process list, so that consumers of the store always receive already-processed data.

**Verification:** Subscribing a listener to `stats:update` should confirm events fire at the expected interval with correctly structured payloads.

### Step 5: Process manager — spawning and monitoring (`core/processManager/index.js`)

Relevant APIs: `child_process.spawn`, the `exit` event, `stdout`/`stderr` stream `data` events.

A test fixture script (`scripts/dummy-worker.js`) should be created that logs output periodically and exits with a non-zero code at a randomized interval, to exercise crash-handling logic during development.

Module responsibilities:
- Spawn a named process and track its PID, command, start time, and status.
- Capture stdout/stderr into a bounded log buffer (see `logBuffer.js`).
- Emit `managed:started` on spawn and `managed:crashed` on unexpected exit.

**Verification:** Spawning the test fixture should produce periodic log events and a crash event when the fixture exits, prior to implementing automatic restart behavior.

### Step 6: Restart logic with exponential backoff (`core/processManager/backoff.js`)

```js
function computeDelay(attempt) {
  const base = 1000;
  const max = 30000;
  return Math.min(base * (2 ** (attempt - 1)), max);
}
```

On process exit, the restart handler should increment the restart count, emit `managed:restarting` with the computed delay, and re-spawn the process via `setTimeout`.

**Verification:** The test fixture should restart automatically after each crash, with restart intervals increasing according to the backoff schedule.

### Step 7: System-level process control (`core/systemControl/index.js`)

Relevant APIs: `process.kill(pid, signal)`; `renice` invoked via `execSync` for priority adjustment.

**Verification:** Terminating a disposable test process via `killByPid` should result in its removal from the next `getProcessList()` result.

### Step 8: Actions layer (`core/actions/index.js`)

This module exposes the complete set of functions available to the presentation layer: `killProcess`, `sortBy`, `filterByName`, `selectProcess`, `spawnManaged`, `killManaged`. No other core module should be imported directly by the UI layer.

At the completion of this step, the store and actions interface is considered stable, and UI development may proceed independently against it.

## 8. Development Milestones

| Phase | Scope |
|---|---|
| 1 | Collector implementation and verification against live system state |
| 2 | Store implementation; polling loop integrated and verified |
| 3 | Process manager: spawn, monitor, and crash detection |
| 4 | Restart logic with exponential backoff |
| 5 | System-level process control (termination, priority adjustment) |
| 6 | Actions layer finalized; store/actions interface frozen |
| 7 | UI implementation against the frozen interface |
| 8 | Refinement and selection of stretch goals (Section 10) |

## 9. Testing Strategy

- **Collector tests**: parsing logic is tested against fixture strings captured from real `top`/`ps` output, rather than invoking the operating system directly, to ensure deterministic and portable test execution.
- **Process manager tests**: the test fixture process is spawned directly; assertions cover `managed:started`, `managed:crashed`, and `managed:restarting` events, including correctness of the backoff delay sequence.
- **System control tests**: a disposable process is spawned, terminated via `killByPid`, and its absence confirmed via `process.kill(pid, 0)` throwing an error (the standard method for checking process liveness without sending a signal).

## 10. Future Work

- Sparkline-style historical graphs for CPU/memory trends.
- Threshold-based visual indicators (e.g., highlighting processes exceeding a CPU usage threshold).
- Persistence of managed-process configuration across application restarts.
- Cross-platform support: Linux is the more straightforward extension, as `/proc/stat` and `/proc/meminfo` provide equivalent data and the process-listing command is largely compatible with macOS. Windows support would require a distinct implementation using `wmic`/`tasklist` and is treated as a separate, later initiative rather than part of the current scope.

## 11. Design Decisions and Scope Notes

- Platform scope is limited to macOS for the current milestone; Linux and Windows support are deferred (Section 10).
- Process management scope includes both application-spawned processes and control of arbitrary system processes, as this requires minimal additional implementation beyond the process-observation logic already required.
- The implementation uses plain JavaScript (CommonJS) without TypeScript or external state-management libraries, consistent with the goal of a fully manually implemented core.
- A polling interval of approximately 1500ms is used as a default and may be adjusted based on observed performance.
- `execSync` is used in the initial implementation for simplicity; migrating to asynchronous `exec`/`spawn` patterns (e.g., via `util.promisify`) is a reasonable subsequent refinement once core functionality is verified.
