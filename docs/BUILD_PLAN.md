# Kestrel — Technical Design & Build Plan

| | |
|---|---|
| **Version** | 2.0 (supersedes the v1 build plan in `docs/archive/`) |
| **Last updated** | 2026-09-28 |
| **Implements** | [PRD.md](PRD.md) v2.0 · UI follows [UI_SPEC.md](UI_SPEC.md) |

---

## 1. Summary

Kestrel is one binary with three layers:

- a **CLI** that decides what to run,
- a **core** engine that samples the OS, supervises processes, and owns all state,
- a **UI** that renders that state and sends user intent back through a fixed set of actions.

The core never imports UI code, and the UI never touches the OS. Everything specific to macOS or Linux
sits behind one **platform adapter** interface, so the rest of the core is the same on every OS.

## 2. Architecture principles

1. **Ports and adapters.** The core depends on interfaces (platform, clock, spawn, filesystem) rather than concrete implementations, so every module can be tested with fakes.
2. **One store, one direction.** `OS → platform → sampler → store → UI`, and `UI → actions → core modules → store`. The UI subscribes to the store and calls actions; nothing else crosses the boundary.
3. **Immutable state.** Every store update replaces objects rather than mutating them, so the UI can compare by reference and skip unchanged renders.
4. **Pure logic separate from I/O.** Parsers, graph ordering, backoff, leak detection, and view derivation are pure functions tested with fixtures. I/O modules stay thin.
5. **Fail soft, report loudly.** No error from the OS or a child process may crash Kestrel. Every failure becomes a store event with a readable message.
6. **No shell unless the user wrote the command.** Kestrel's own calls (`ps`, `lsof`, `ss`, `vm_stat`) use `execFile` with argument arrays; renice uses the `setpriority` syscall directly (`os.setPriority`), so it works on minimal images without the `renice` binary. Only commands from the user's config run through a shell (§10).

## 3. Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | JavaScript with **JSDoc types**, checked by `tsc -p tsconfig.core.json` (`strict`) | Type safety without a build step; the core stays readable. TypeScript is pinned to **6.0.3**, the last JavaScript-based compiler, because the TypeScript 7 native compiler's JSDoc checking is less mature |
| Runtime (shipped) | **Bun ≥1.3**, compiled with `bun build --compile` into one binary | OpenTUI requires Bun (or Node ≥26.4). Compiling bundles the runtime, so users need nothing installed |
| Runtime (core tests) | Node ≥20 `node:test` **and** `bun test` | The core must run on both. This guards against relying on anything only one runtime has |
| UI | OpenTUI 0.5.x + React 19, **exact versions pinned** | Terminal renderer with flexbox layout. Pre-1.0, so pinning is essential |
| Core module format | CommonJS | Already used in the existing core. Bun loads it alongside the ESM UI |
| Argument parsing | `util.parseArgs` (built in) plus an alias pre-pass | No extra dependency. The pre-pass rewrites `-pm` to `pm` and so on |
| Config validation | Hand-written validator (`core/config/schema.js`) | Errors point at exact paths such as `processes.api.ready.port`. No dependency |
| Dependencies policy | Runtime dependencies are limited to OpenTUI + React | Every added dependency is supply-chain risk and binary size |

## 4. Data flow

```
                ┌──────────────────── kestrel binary ─────────────────────┐
  argv ──▶ cli/ ─┤                                                          │
                │   core/                                                   │
                │   ┌────────────┐ snapshot ┌──────────┐  state/events      │
   macOS/Linux ◀┼──▶│ platform/  │─────────▶│ sampler/ │────────┐           │
   ps,/proc,    │   │ darwin|lin │          │ history  │        ▼           │
   lsof, ss     │   └────────────┘          └──────────┘   ┌─────────┐      │
                │   ┌────────────┐  spawn/exit/logs        │ store/  │─────▶┼──▶ ui/ (OpenTUI)
   child procs ◀┼──▶│ supervisor │────────────────────────▶│         │      │      │
                │   │ + stack/   │                         └─────────┘      │      │
                │   └────────────┘                              ▲           │      │
                │   ┌────────────┐                              │           │      │
                │   │ config/    │ kestrel.json│Procfile│pkg│pm2│           │      │
                │   └────────────┘                              │           │      │
                │   ┌────────────┐          ┌──────────┐        │           │      │
                │   │ sysControl │◀─────────│ actions/ │◀───────┼───────────┼──────┘ user intent
                │   └────────────┘          └──────────┘                    │
                └───────────────────────────────────────────────────────────┘
```

## 5. Repository structure (target)

The project directory is written to be the **root of its own repository**. Every path below is relative
to it, so the planned move to a separate repo (§14) is a straight copy.

```
kestrel/
├── cli/
│   ├── index.js              # entry: alias pre-pass, parseArgs, dispatch
│   ├── args.js               # alias table + validation (pure)
│   └── commands/             # overview, pm, sm, init, import, doctor, update
├── core/
│   ├── platform/
│   │   ├── index.js          # picks darwin|linux, exposes PlatformAdapter
│   │   ├── types.js          # JSDoc typedefs: ProcessInfo, MemoryInfo, PortInfo…
│   │   ├── darwin.js         # ps, vm_stat, sysctl, lsof
│   │   ├── linux.js          # adapter: /proc, ss (fallback /proc/net/tcp)
│   │   ├── linuxParsers.js   # pure /proc, ss and tcp parsers
│   │   ├── net.js            # shared address parsing / IPv6 formatting
│   │   └── errors.js         # PlatformError
│   ├── sampler/
│   │   ├── index.js          # tick loop, CPU deltas, cadence per data source
│   │   ├── ring.js           # fixed-size ring buffer for history
│   │   └── leak.js           # memory-growth detector (pure)
│   ├── config/
│   │   ├── index.js          # discovery + source precedence (PRD §5.2)
│   │   ├── schema.js         # validate + normalize kestrel.json
│   │   ├── procfile.js       # parse Procfile
│   │   ├── packageJson.js    # detect npm scripts
│   │   ├── pm2.js            # pm2 jlist / ecosystem → kestrel config
│   │   └── dotenv.js         # parse .env
│   ├── stack/
│   │   ├── graph.js          # dependsOn topological sort + cycle detection (pure)
│   │   └── orchestrator.js   # start/stop the stack in order, waits on readiness
│   ├── processManager/       # supervisor for a single process
│   │   ├── index.js          # spawn, exit handling, restart policy, state machine
│   │   ├── backoff.js        # existing
│   │   ├── logBuffer.js      # existing (bounded in-memory buffer)
│   │   ├── logFile.js        # persisted, rotated logs
│   │   ├── readiness.js      # port / http / log probes
│   │   └── runState.js       # .kestrel/run.json for orphan recovery
│   ├── systemControl/
│   │   ├── index.js          # existing kill/renice
│   │   └── policy.js         # safety tier classification (pure)
│   ├── store/
│   │   ├── index.js          # Store
│   │   ├── state.js          # initial state, constants, event list
│   │   ├── types.js          # the frozen contract as JSDoc types
│   │   └── selectors.js      # derived views: sorted/filtered, tree, managed resources
│   ├── names.js              # shared process-name rule
│   ├── index.js              # composition root: createKestrel()
│   └── actions/index.js      # the only API the UI may call
├── ui/
│   ├── main.jsx · App.jsx
│   ├── theme/                # tokens.js, capabilities.js (color depth detection)
│   ├── screens/              # Overview.jsx, Monitor.jsx, Manager.jsx
│   ├── components/           # Sparkline, Meter, CoreGrid, ProcessTable, ProcessTree,
│   │                         # PortsTable, StackList, LogView, Drawer, Dialog, Toast, Footer…
│   ├── keymap.js             # keys for each screen (also used to render the footer and help)
│   └── format.js
├── packaging/
│   ├── install.sh            # curl | sh installer
│   ├── npm/                  # kestrel-tui launcher + per-platform package template
│   └── homebrew/kestrel.rb.tmpl
├── scripts/                  # dummy-worker.js, build.js, bench.js
├── tests/
│   ├── unit/ · integration/ · ui/ · e2e/
│   └── fixtures/{darwin,linux}/   # captured ps/vm_stat//proc/lsof/ss output
├── .github/workflows/        # ci.yml, release.yml (these start running after the repo move)
└── docs/                     # PRD.md, BUILD_PLAN.md, UI_SPEC.md, archive/
```

## 6. The store contract

The store is the only interface between the core and the UI. **Milestone 1 freezes this contract**, and
from then on UI work can proceed against it with fakes.

### 6.1 State shape

```js
state = {
  meta:    { version: '1.0.0', platform: 'darwin', arch: 'arm64', hostname: 'mbp', isRoot: false,
             startedAt: 1759050000000, configPath: '/repo/kestrel.json' | null,
             configSource: 'kestrel.json' | 'Procfile' | 'package.json' | null },
  system:  { cpuPercent: 42.3, cores: [12.1, 80.4, …], load: [1.2, 1.4, 1.1],
             memUsedMB: 8213, memTotalMB: 16384, swapUsedMB: 0, uptimeSec: 134221 },
  history: { cpu: [/* last 60 values */], mem: [/* last 60 values */] },
  processes: [ { pid, ppid, name, command, user, cpu, memMB, state, startedAt,
                 managedId: 'api' | null, level: 'ok'|'warn'|'danger' } ],  // derived view
  ports:   { items: [ { port: 3000, address: '127.0.0.1', proto: 'tcp', pid, name } ],
             partial: true,           // true when some owners were hidden (not root)
             updatedAt: 1759050000000 },
  managed: [ { id: 'api', cmd, cwd, status, pid, startedAt, restartCount, exitCode, signal,
               ready: { kind: 'port', target: 3000, ok: true } | null,
               resources: { cpu: 18.2, memMB: 412, procCount: 4 },
               memHistory: [/* 1 sample per 5 s, 10 min */], leakSuspect: false,
               dependsOn: ['db'], logCount: 1932 } ],
  alerts:  [ { id, level: 'warn'|'danger', source: 'managed:api', message, at } ],
  ui:      { screen: 'overview'|'monitor'|'manager', monitorView: 'table'|'tree'|'ports',
             selectedPid, sortBy: 'cpu', sortDir: 'desc', filterQuery: '',
             collapsedPids: [], selectedManagedId, logFilter: '', logFollow: true,
             toast: { level, message, at } | null },
  settings: { thresholds: { cpu: [50, 80], memMB: [500, 1500] } },
  errors:  { ports: { message, at } },   // one entry per failing data source; absent when healthy
}
```

**M2 additions (deliberate, contract test updated):** `topConsumers` (top 5 by CPU, unaffected by the
Monitor filter), the `describeProcess` action and the `notify` action.

**M2b additions (btop-style dashboard, deliberate):** `ui.screen` is now `'dashboard'` (the Overview and
Monitor screens are gone); `monitorView` is `table`/`tree` only; `ui.focus` (`proc`/`ports`) with the
`setFocus` action (ports refresh every second while focused); `system.memCachedMB` and
`system.swapTotalMB` for the mem box; history grew from 60 to 240 samples (4 minutes of graph).

**M3 additions (process manager, deliberate):**
- `stack: { name, source, path, errors, warnings, scripts, phase, stopProgress }`: the project's stack.
  `errors` holds an invalid config's problems (nothing is registered then). `scripts` lists package.json
  candidates for the first-run picker. `phase` is `idle`/`starting`/`running`/`stopping`/`stopped`, and
  `stopProgress` maps each process to `stopping`/`stopped` while the stack stops (the quit progress, S12).
- `orphans: [{ id, pid, pgid, startedAt }]`: children a previous Kestrel left running (S13).
- Managed entries gain `restart` (the policy) and `blockedBy` (the failed dependencies while `blocked`).
- `ui.focus` gains `'managed'`.
- New actions: `adoptScripts(names, { save })`, `stopOrphans()`, `dismissOrphans()`. `startStack`,
  `stopStack` and `saveAdHoc` are real now. `start(id)` starts (in M2 it restarted).

The authoritative definition is `core/store/types.js`. `tests/unit/contract.test.js` takes a snapshot of every
key, event and action name, so any change to the contract has to be deliberate.

Rules:
- `processes` is always **already filtered, sorted, and tagged** (with `managedId` and `level`). Consumers never re-derive it.
- Log lines are **not** kept in state (too large and too frequent). The UI reads them through `actions.getLogs(id, { from, limit, filter })` and is notified by `managed:log` events.

### 6.2 Events

| Event | Payload | When |
|---|---|---|
| `change` | full state | Every commit. The UI's single subscription point |
| `stats:update` / `processes:update` / `ports:update` | slice | After each sample of that source |
| `managed:status` | `{ id, from, to }` | Every state-machine transition (§8.4), and `to: 'removed'` when a process is removed from the manager (M3 review) |
| `managed:log` | `{ id, line: { seq, ts, stream, text } }` | Each output line. The entry's `logCount` reaches the store in batches (every 250 ms), so chatty processes don't flood the UI (M3) |
| `managed:ready` | `{ id, kind, elapsedMs }` | Readiness check passed |
| `alert` | alert object | Threshold crossed, leak suspected, or process errored |
| `collector:error` | `{ source, message }` | A platform call failed (only that source is skipped for the tick; it isn't fatal) |
| `ui:update` | `ui` slice | Any UI state change |
| `managed:started` / `managed:crashed` / `managed:restarting` / `managed:killed` | entry / `{ id, exitCode, signal }` / `{ id, attempt, delayMs }` / `{ id }` | Lifecycle milestones (kept from v1) |

### 6.3 Actions (the only calls the UI may make)

Every action returns `{ ok, data, error }` (or a Promise of one) and **never throws**. Failures also carry
a stable `code` (e.g. `ECONFIRM`, `EBLOCKED`, `EPERM`), so the UI can tell "open the confirm dialog"
apart from "show an error".

| Group | Actions |
|---|---|
| Navigation | `setScreen`, `setMonitorView`, `select(pid)`, `moveSelection(delta)`, `toggleCollapse(pid)`, `selectManaged(id)` |
| View | `sortBy(key)`, `filter(query)`, `setLogFilter(q)`, `setLogFollow(bool)`, `dismissToast()`, `notify(level, message)` (M2: shows action results as toasts) |
| System | `classifyTarget(pid) → {tier, reason}`, `describeProcess(pid) → {process, parents, nice}` (M2), `kill(pid, signal, confirmation)`, `renice(pid, nice, confirmation)`, `killPort(port, confirmation)` |
| Stack | `startStack({ only })`, `stopStack()`, `adoptScripts(names, { save })` (M3), `start(id)`, `stop(id)`, `restart(id)`, `addAdHoc(name, cmd)`, `saveAdHoc(id)`, `stopOrphans()`, `dismissOrphans()` (M3) |
| Logs | `getLogs(id, { from, limit, filter })`, `revealEnv(id)` |
| Lifecycle | `quit()`: stops the stack gracefully, then resolves |

`kill` and `renice` require a `confirmation` token that matches the tier returned by `classifyTarget`
(§8.6). A UI bug therefore can't skip the confirmation step. The token also carries the **pid the user was shown**: `killPort` refuses (`ECHANGED`) if the port's owner changed between opening the dialog and confirming (found in the M2 review).

## 7. Platform adapter

### 7.1 Interface

```js
/** @typedef {Object} PlatformAdapter
 *  @property {() => Promise<ProcessInfo[]>} listProcesses   // pid, ppid, name, command, user, state, cpuTicks|cpuPercent, rssKB, startedAt
 *  @property {() => Promise<MemoryInfo>}    memory          // totalMB, usedMB, swapUsedMB
 *  @property {() => Promise<PortInfo[]>}    listeningPorts  // + { partial: boolean }
 *  @property {() => CpuTimes[]}             cpuTimes        // per core, from os.cpus() (same on both OSes)
 *  @property {() => number[]}               loadAverage     // os.loadavg()
 */
```

The CPU calculation is shared. `os.cpus()` gives cumulative per-core times on both OSes, so the sampler
works out busy% from the difference between two ticks. This **replaces `top -l 1`**, which takes about
1 s to run and whose first sample is unreliable.

### 7.2 macOS (`darwin.js`)

| Data | Source | Notes |
|---|---|---|
| Processes | `ps -A -o pid=,ppid=,pcpu=,rss=,state=,user=,etime=,comm=` | startedAt = now − `etime`. `etime` is used instead of `lstart` because `lstart` depends on locale and timezone. `pcpu` is a decaying recent average, which is acceptable |
| Memory | `vm_stat` + `sysctl hw.memsize vm.swapusage` | used = (anonymous − purgeable + wired + occupied by compressor) × page size, which is Activity Monitor's "Memory Used". `top`'s "PhysMem used" also counts file cache and overstates pressure. On older systems without anonymous-page counts, active pages are used instead of anonymous − purgeable |
| Ports | `lsof -nP -iTCP -sTCP:LISTEN -Fpcn` | Machine-readable `-F` output. Only the user's own processes unless root |

### 7.3 Linux (`linux.js`)

| Data | Source | Notes |
|---|---|---|
| Processes | `/proc/[pid]/stat`, `/proc/[pid]/status` (Uid), `/proc/[pid]/cmdline` | **Don't use `ps %cpu`: on Linux it's a lifetime average.** The sampler computes CPU% from the change in `utime + stime` between ticks, divided by `CLK_TCK` (read once via `getconf CLK_TCK`, default 100). A process that exits mid-read is skipped |
| Users | `/etc/passwd`, parsed once into a uid → name map | Unknown uids are shown as numbers |
| Memory | `/proc/meminfo` | used = MemTotal − MemAvailable |
| Ports | `ss -ltnpH`, falling back to `/proc/net/tcp{,6}` + inode → pid mapping | Minimal images may not have `ss` |

### 7.4 How often each source is sampled

| Source | Default interval | Why |
|---|---|---|
| CPU, memory, processes | 1 s (`monitor.intervalMs`) | Main refresh |
| Ports | 5 s, or 1 s while the Ports view is open | `lsof` can take 100–300 ms |
| Managed memory history | 5 s | Feeds the leak detector; 10 minutes = 120 samples |

A tick is skipped if the previous one is still running (the existing `inFlight` guard), so slow calls never pile up.

## 8. Core modules

### 8.1 Sampler and history
- Keeps the previous CPU times for the machine and for each process, and emits deltas. Per-process state is dropped when the PID disappears.
- Fixed-size ring buffers: system CPU and MEM hold 60 samples, and each managed process's memory holds 120 samples. Updates return new arrays, so no copy is ever shared.

### 8.2 Config

**`kestrel.json` schema (version 1)**

```jsonc
{
  "version": 1,
  "processes": {
    "db":  { "cmd": "docker compose up postgres", "ready": { "port": 5432 } },
    "api": {
      "cmd": "npm run dev",
      "cwd": "./server",                 // relative to the config file
      "envFile": ".env",                 // default ".env" when present
      "env": { "PORT": "3000" },
      "dependsOn": ["db"],
      "ready": { "http": "http://localhost:3000/health", "timeoutMs": 60000 },
      "restart": "on-failure",           // on-failure | always | never
      "maxRestarts": 10,
      "stopSignal": "SIGTERM",
      "stopTimeoutMs": 5000
    },
    "worker": { "cmd": "node worker.js", "ready": { "log": "worker ready" } }
  },
  "monitor": {
    "intervalMs": 1000,
    "thresholds": { "cpu": [50, 80], "memMB": [500, 1500] }
  }
}
```

- Process names must match `^[A-Za-z0-9._-]{1,64}$` (the existing ID pattern). A `ready` object must contain exactly one of `port`, `http`, or `log`.
- The validator collects **all** errors with their paths (`processes.api.dependsOn[0]: unknown process "dbb"`) instead of stopping at the first.
- **Procfile** → `{ name: { cmd } }` with default settings. **package.json** → one entry per selected script as `npm run <script>`. With a lockfile present, the matching runner is used instead (`pnpm`, `yarn`, `bun`).
- `cwd` resolves from the config file's folder. `envFile` resolves from the process's `cwd`, because a `.env` file usually sits next to the app it configures.
- **pm2**: `pm2 autorestart: true` maps to `restart: "always"`, since pm2 restarts on *any* exit. Env is **not** imported from `pm2 jlist`, because it contains the daemon's entire environment and copying it could leak unrelated secrets; env *is* imported from ecosystem files, where the user declared it. `pm2 jlist` is preferred because it's plain data. For `ecosystem.config.js` the file has to be run to be read, which is what pm2 does too. Kestrel shows `This will execute ecosystem.config.js to read it. Continue? [y/N]` first.
- **dotenv**: `KEY=VALUE`, quoted values, `#` comments, `export ` prefix. No variable interpolation in v1 (documented).

### 8.3 Stack orchestration
- `graph.js` does a Kahn topological sort. It returns start order in "waves" (processes with no dependency between them start in parallel) and reports cycles as a path, e.g. `api → worker → api`.
- **Start:** each wave starts once every dependency is `running`, meaning its ready check has passed or it has none. If a dependency is `errored` or `unready`, its dependents are marked `blocked` with the reason.
- **Stop:** reverse wave order, with processes in the same wave stopped in parallel. Ad-hoc processes stop first.
- **Built in M3** (`orchestrator.js`): "settled" means `running` or `exited` (ok) versus `unready`, `errored`,
  `crashed` for good, or `stopped` (failed). A crash that is immediately followed by a restart still counts as
  settling. A blocked process starts by itself once all its dependencies are healthy again (for example after
  you fix and restart a crashed db). `startStack({ only })` adds each selected process's dependencies.
- **Session** (`session.js`): registers the config's processes as `idle`, owns the stack state (§6.1) and the
  orphan flow. **Starting waits until the orphan question is answered**, because a new db would otherwise race
  the left-over one for its port (found in M3 E2E testing). The wait ends after 5 s if no process list arrives.

### 8.4 Supervisor state machine

```
 idle ──start──▶ starting ──ready ok / no check──▶ running
                   │   └──ready timeout──▶ unready (keeps running, dependents blocked)
                   │
      exit≠0 or unexpected exit (per restart policy)
                   ▼
              restarting ──backoff delay──▶ starting
                   │
      restarts > maxRestarts
                   ▼
               errored ──manual start──▶ starting
 any ──stop──▶ stopping ──exit / SIGKILL after stopTimeoutMs──▶ stopped
 dependency failed ──▶ blocked ──dependency recovers──▶ starting
```

- Kept from the existing code: its own process group for each child (`detached: true`), group-wide signals, serialized operations per ID, a backoff streak that resets after 30 s of stable running, and SIGKILL after the grace period.
- **Termination is detected on `close`, not `exit`** (fixed in M1). On Linux, `exit` can arrive before the last stdout/stderr chunk, which would log a crash before the output that explains it. Kestrel waits for `close` (streams drained), but stops waiting 1 s after `exit` in case a background grandchild keeps the pipe open. Both cases have regression tests.
- **Leftover processes are cleaned up** (fixed in M1, found in code review). When a managed command's main process exits, anything it left running in its process group (e.g. `server &` in a wrapper script) gets SIGTERM, then SIGKILL after the grace period, so it can't be orphaned while holding a port. Stop and shutdown reach the group through the remembered pgid even after the main process is gone. The pgid is forgotten once the group is empty, so a reused pid is never signalled. A consequence: commands that daemonize themselves (fork and exit) aren't supported, which is the same as pm2 and systemd `Type=simple`; run them in the foreground.
- New in M3 (`supervisor.js`, one per process; `index.js` is the manager facade): restart policies
  (`on-failure`, `always`, `never`), `maxRestarts` consecutive crashes → `errored` plus a danger alert, the
  process's own `stopSignal` with SIGKILL after `stopTimeoutMs`, readiness probes (`readiness.js`: TCP connect
  to 127.0.0.1 then ::1, or HTTP GET with a 2 s timeout where 2xx/3xx passes, every 500 ms until `timeoutMs`,
  or a regex tested against each output line), saved logs, and env merging (`env.js`: inherited < `envFile`
  < inline `env`; a missing *explicit* envFile is `errored` with a log line, the default `.env` is optional).
- **Known limits** (M3 review, accepted):
  - A single stop (`x`, `r`) resolves once the main process has exited. Anything it left in its group is
    still being swept (SIGTERM, then SIGKILL after `stopTimeoutMs`). A full quit escalates at once.
  - The last-resort `process.on('exit')` cleanup can only send SIGTERM, because a synchronous exit handler
    can't wait. Quit, SIGTERM and SIGHUP all take the graceful path, which escalates.
- **Log volume** (measured in M3): the in-memory buffer is append-only with amortized trimming. Copying it on
  every line cost about a million element copies per second at 500 lines/s. Log-only updates reach the store
  every 250 ms instead of per line.
- **Saved logs** (`logFile.js`): lines are appended as `ISO-timestamp stream text` to `.kestrel/logs/<id>.log` (mode 0600, directory 0700). Files rotate at 10 MB, keeping `.1` to `.3`. Writes are buffered and flushed every 250 ms, and flushed synchronously on shutdown.
- **Run state** (`runState.js`): `.kestrel/run.json` records `{ kestrelPid, children: [{ id, pid, pgid, startedAt }] }`. It is rewritten atomically (0600) whenever the set of live children changes, and removed when none are left. On the next start, entries whose PID is alive **and** has a matching start time (±3 s) count as orphans. Checking the start time guards against a new, unrelated process that reused the PID. If the recorded Kestrel is still alive, nothing counts as an orphan and a warning says another Kestrel manages the stack. Stopping orphans re-verifies each one first, and signals a whole group only when the pid is its group leader.

### 8.5 Resource link and leak detector
- **Resource link** (a pure selector): build a `ppid → children` map from the process snapshot, walk the tree from each managed root PID, and sum CPU and RSS. It also tags every process in the tree with `managedId`, which the Monitor table uses to show the managed badge.
- **Leak detector** (`leak.js`, pure): linear regression over the last 120 memory samples (10 minutes). It flags a process when **all** of these hold: slope ≥ 1 MB/min, R² ≥ 0.8, total growth ≥ 20%, and at least 120 samples collected. The flag clears after 60 s without the conditions holding, so it doesn't flicker. Advisory only.

### 8.6 Safety policy (`policy.js`, pure)

| Tier | Condition | Required confirmation |
|---|---|---|
| `blocked` | PID ≤ 1, Kestrel's own PID, or Kestrel's parent shell | none; the action is refused with the reason |
| `managed` | PID belongs to a managed process tree | one key. The UI offers "stop via manager" instead, so auto-restart doesn't just bring it back |
| `own` | process user = current user | one key (`y`) |
| `system` | a different user, or root | type the process name exactly |

### 8.7 CLI
- The alias pre-pass maps `-pm`/`--pm` → `pm` and `-sm`/`--sm` → `sm` **before** `util.parseArgs`, so `-p -m` style bundling can't happen.
- Exit codes: `0` normal, `1` runtime error, `2` usage or config error. That makes `kestrel doctor` usable in scripts.
- Non-TTY (piped output or CI): interactive commands print a clear error and suggest `kestrel doctor`.

## 9. Failure modes

| Failure | Behavior |
|---|---|
| `ps`, `lsof` or `ss` missing or failing | That data source shows an inline banner ("ports unavailable: `ss` not found") while everything else keeps working. `doctor` explains the fix |
| Hundreds of processes exit between reads (Linux `/proc` races) | Missing `/proc/[pid]` entries are skipped silently. They're expected, not errors |
| Managed process never becomes ready | Status `unready`, dependents `blocked`, and an alert with the last 20 log lines one key away |
| Crash loop | Backoff grows to 30 s, then `errored` after `maxRestarts`, raising a danger alert. Nothing restarts forever |
| Kestrel receives SIGHUP (SSH dropped) or SIGTERM | Graceful stack shutdown (P11), log flush, then exit |
| Kestrel is SIGKILLed or crashes | Children survive, since they have their own groups. `run.json` lets the next start detect and offer to stop them (P12) |
| Invalid `kestrel.json` | `pm` refuses to start and prints every validation error with its path. `sm` isn't affected |
| Terminal smaller than 60×16 | A "terminal too small" message; sampling continues |
| Log disk full or write error | One warning toast, and the file sink for that process is disabled; in-memory logs continue |

## 10. Security model

| Surface | Control |
|---|---|
| Config commands | Run through the user's shell **only** when the user types `kestrel pm` or starts a process. `kestrel` and `kestrel sm` never run anything from a config. This is the same trust level as `npm run` |
| Kestrel's own OS calls | `execFile` with argument arrays and no shell. PIDs, signals, and nice values are validated (the existing checks are kept) |
| Kill and renice | Tiered policy with confirmation tokens enforced in the core (§8.6), not only in the UI |
| Secrets | Env values masked in the UI. `.kestrel/` files are 0600/0700. `kestrel init` offers to add `.kestrel/` to `.gitignore`. Env values are never logged |
| pm2 ecosystem `.js` | Runs only after an explicit prompt. `pm2 jlist` (plain data) is preferred |
| Releases | Checksums plus GitHub artifact attestations. The installer and `update` refuse to install if the checksum doesn't match. The installer never uses sudo on its own |
| Telemetry | None. The update check is one GitHub API request per day and can be turned off |
| Supply chain | Two runtime dependencies, pinned. `bun install --frozen-lockfile` in CI. Dependabot on |

## 11. Quality: testing and performance

| Layer | What | Tooling |
|---|---|---|
| Unit | Parsers against fixture strings for **both** OSes, schema validator, graph, backoff, leak detector, policy, selectors, alias pre-pass | `node:test` (+ `bun test` to confirm it runs on both) |
| Integration | Supervisor with `scripts/dummy-worker.js`: crash, restart, backoff, readiness (port/log), dependsOn order, graceful stop, log rotation | `node:test` with real child processes |
| UI | Screens rendered against a fake store: states, keymap, confirmation flows | OpenTUI test renderer via `bun test` |
| E2E | The compiled binary on each CI OS: `--version`, `doctor`, `sm` in a pseudo-terminal for 3 s, `pm` with a fixture stack, then quit and a check that no orphans remain | `scripts/e2e/pm-e2e.sh` (M3; Python PTY driver with a minimal screen emulator) |
| Types | `tsc --noEmit` with `checkJs` over core, cli, and ui | CI gate |
| Coverage | **≥ 80%** on `core/` and `cli/` | `--experimental-test-coverage` |

**Performance targets** (`scripts/bench.js`, run in CI). Every report shows the targets. Since the
2026-09-29 ship-first decision, CI fails only above a **regression guard** (4% CPU, 120 MB), and the
< 1% target is the next optimisation goal (§11.3):

| Metric | Budget |
|---|---|
| Time to first frame | < 300 ms |
| Kestrel's own CPU averaged over a 60 s idle run | < 1% of one core |
| Kestrel's own RSS after 10 min with 5 managed processes | < 80 MB |
| One sampling tick with 1,000 synthetic processes (pure path) | < 20 ms |

### 11.1 Measured in M2 (macOS arm64, about 600 processes, 1 s refresh, production build)

| Metric | Budget | Measured | Notes |
|---|---|---|---|
| Time to first frame | < 300 ms | **68 ms** median (220 ms cold) | ✅ |
| RSS, interactive | < 80 MB | **70 MB** (btop-style dashboard; 62 MB for the v1 UI) | ✅ (engine alone: 35 MB) |
| Kestrel's own CPU, interactive | < 1% | **2.6%** (v1 UI: 2.4%) | ❌ htop uses 0.23% on the same machine |
| Engine alone (`scripts/bench.js`) | < 1% | **1.4%** | ❌ most of it is spawning and parsing `ps` every second |

Found and fixed while measuring: an explicit `intervalMs: undefined` overrode the default, which sampled `ps`
~30×/s (36.6% CPU at first). The UI also ran React's development build: production mode must be set at
**process start** (`npm start`, the release build's `--define`), because Bun fixes the JSX transform at
startup and switching later crashes with "jsxDEV is not a function".

**Planned fix for the CPU budget (M4, before the release gate):** replace the per-second `ps` spawn with
native calls through Bun's FFI: `libproc` (`proc_listpids`/`proc_pidinfo`) on macOS and direct `/proc` reads
(already used) on Linux. Until then `scripts/bench.js` exits non-zero, deliberately.

### 11.2 Measured in M3 (same machine, `kestrel pm`, logs panel on screen)

| Scenario | CPU | RSS | Notes |
|---|---|---|---|
| Demo stack: 4 processes, ~3 log lines/s, one crash loop | **3.7–4.3%** | 39–71 MB | The M2 dashboard alone is 2.6% |
| One process printing 500 lines/s, before the fixes | 22.2% | 112 MB | One store commit and one full buffer copy per line |
| Same, after batching + append-only buffer | **9.0%** | 94 MB | Engine alone 3.9%, sampler included |

What is left is the UI redrawing the whole dashboard 4–5 times a second while logs stream. The next step,
together with the M4 native sampling, is memoizing the boxes so a log update only redraws the logs panel.

### 11.3 Measured in the M4 optimisation pass (2026-09-29)

**The earlier numbers missed the processes Kestrel spawns.** `process.cpuUsage()` and `ps -o time` only
see Kestrel itself, while most of the cost was in `ps`/`lsof` children. `scripts/bench.js` now measures
the whole tree.

| What | Before | After | Change |
|---|---|---|---|
| Engine, macOS, 574 processes (children included) | 7.09% | **1.45–2.08%** | libproc via Bun FFI instead of spawning `ps`/`vm_stat`/`sysctl`/`lsof`; the trimmed `ps` for other users' processes every 5 s costs ~0.35% |
| Engine, Linux container, 600 processes | 24.4% | **2.7%** | Only `/proc/<pid>/stat` read per tick, synchronously; identity cached per process; `/proc/stat` instead of `os.cpus()`; `ss` probed once; socket owners cached |
| Selectors, 571 processes, table view | 0.92 ms/tick | **0.31 ms** | Linear child index (it was quadratic per parent), single-pass top 5 |
| Dashboard (`kestrel sm`), macOS, in a PTY | ~7–8% | **3.1–3.4%**, ~80 MB | The above; the UI itself is ~1% |

**What limits the rest:** a native sample costs ~2 ms in a tight loop but ~6–7 ms when it runs once a
second. Just waking up and listing pids costs ~3.6 ms (user + kernel), and a full native pass adds only
~0.2 ms to that. Apple Silicon runs a mostly idle process on an efficiency core, and caches are cold.
Tried and dropped, because they gave no measurable gain: caching FFI pointers, and skipping per-tick
calls for other users' processes. Getting under 1% therefore needs structural changes (for example
sampling less while nothing is on screen, or a longer default interval), not micro-optimisations.

**The UI** (`scripts/bench-ui.jsx`: the real App in OpenTUI's test renderer, 570 processes, 160×50,
production React):
- A frame costs ~3.1 ms of CPU (it was 3.7 ms before the braille graph stopped slicing per cell). A frame
  with nothing changed costs 0.2 ms.
- Each tick makes ~45 text updates (9 cpu rows, ~30 visible process rows whose values really changed,
  the mem meters) with ~390 styled chunks, and each update costs ~18 µs inside OpenTUI's native text
  buffer. That is ~60% of a frame and internal to OpenTUI.
- Memoization cannot remove these updates, because they are real changes. Cutting further means showing
  less or refreshing less (product decisions), or a cheaper text path in OpenTUI itself.

Live dashboard after both passes: **3.16%** of a core, 76 MB (macOS, `kestrel sm`, PTY, children
included).

## 12. Milestones

Every milestone produces something usable and ends with a review. The order follows the dependency
chain: contracts first, then the Monitor (the primary job), then the Manager, then shipping.

### M0 — Clean slate (done 2026-09-28)
- The prototype was removed and Kestrel rebuilt from scratch to the §5 layout, as a standalone package (`kestrel-tui`, MIT). Proven logic was *ported* with new tests (§15).
- The history starts in this repository (§14).

### M1 — Foundation (week 1)
1. `core/platform`: interface, `darwin.js` (moving the existing parsers over), `linux.js`, and fixtures for both.
2. `core/sampler`: CPU deltas from `os.cpus()`, per-process deltas on Linux, ring buffers, sampling cadence.
3. `core/store` v2: state shape §6.1, selectors (sort, filter, tree, resource link, threshold level).
4. `core/config`: schema validator, discovery, Procfile, package.json detection, dotenv, pm2 import.
5. `cli/`: alias pre-pass, `parseArgs`, dispatch to stub commands, exit codes, and a working `--version`/`--help`.
6. **Freeze the store and actions contract** (§6).
7. Brought forward because they are core logic: the safety policy (§8.6, originally M2), `stack/graph.js` (§8.3, originally M3, needed for config cycle checks), and the M1 part of the process manager.
- **Exit:** a headless `kestrel sm --dump` (developer flag) prints correct JSON snapshots on macOS and in a Linux container (Docker), with tests ≥ 80%.

### M2 — Monitor complete (week 2) — built 2026-09-29; redesigned btop-style (M2b) after the review
1. Theme tokens and color-depth detection, following UI_SPEC §3.
2. App shell: header, footer from the keymap, toasts, dialogs, help overlay, size breakpoints.
3. Overview screen with cards and drill-in.
4. Monitor: table, tree, per-core grid, sparklines, thresholds, filter, sort, detail drawer.
5. Ports view, kill-by-port, and tiered safety dialogs.
- **Exit:** `kestrel sm` replaces htop for a full day of daily use. UI tests cover every state in UI_SPEC §7.

### M3 — Manager complete (week 3) — built 2026-09-29
1. Supervisor v2: state machine, restart policies, env merging, saved logs, run state.
2. Readiness probes and the stack orchestrator (waves, blocked, reverse stop).
3. Manager screen: stack list, log pane (follow, search, all-processes view), env reveal.
4. Resource link surfaced in the Manager, Overview, and Monitor badge. Leak detector alerts.
5. `kestrel init`, and `pm` onboarding when no config exists.
- **Exit:** `kestrel pm` runs a real 3-process fixture stack with a dependency and a readiness check. Killing a child recovers it, and Ctrl+C leaves zero orphans (checked by an E2E test).
- **Status:** built as planned, with two changes. The Manager is a box on the dashboard (logs take the big
  panel while it has focus), not a separate screen. The failed-process alert jumps to its logs with `L`.
  - `tests/fixtures/stack` is the demo stack.
  - `scripts/e2e/pm-e2e.sh` runs it in a real pseudo-terminal: ready in order → q → y → zero processes left
    → run state cleared. It passes on macOS, and in Debian 12 and Amazon Linux 2023 via
    `scripts/docker-e2e.sh`.
  - The hard-crash path (`kill -9` → S13 → `s` → the stack starts) and the SIGHUP path were checked by hand
    in a PTY.

### M4 — Ship (weeks 4–5)
1. **Move to the new repository** (§14). CI can't run before this step.
2. `ci.yml`: a test matrix on macOS and Ubuntu, type checks, coverage, and a Linux container test for Amazon Linux 2023.
3. `release.yml` (§13): native builds for 4 targets, E2E test of each binary, checksums, attestations, GitHub Release, npm publish, Homebrew formula bump.
4. `packaging/install.sh`, the npm launcher, and the Homebrew formula template. `kestrel update` and `doctor`.
5. Native process sampling on macOS via FFI to meet the CPU budget (§11.1). The release build compiles with `--define process.env.NODE_ENV='"production"'`.
6. Performance benchmarks as a CI gate. README with the demo GIF, install matrix, and comparison table.
- **Exit:** on a fresh EC2 instance, `curl … | sh` followed by `kestrel pm` works in under 60 s. The same holds for `brew install` on a Mac and `npx kestrel-tui`.

## 13. Distribution and release engineering

| Step | Detail |
|---|---|
| Trigger | Pushing a tag `vX.Y.Z` (semver). The changelog is generated from conventional commits |
| Build matrix | `macos-14` → darwin-arm64 · `macos-13` → darwin-x64 · `ubuntu-latest` → linux-x64 · `ubuntu-24.04-arm` → linux-arm64. Builds must be **native**, because cross-compiling fails (verified 2026-09-28: `Could not resolve "@opentui/core-linux-x64"`) |
| Command | `bun build --compile --minify --sourcemap ./cli/index.js --outfile dist/kestrel-<os>-<arch>` |
| Verify | Each binary runs the E2E smoke test on its own runner before it's uploaded |
| Artifacts | `kestrel-<os>-<arch>.tar.gz`, `checksums.txt`, and attestations (`actions/attest-build-provenance`) |
| Channels | GitHub Release (source of truth) → Homebrew tap repo `3ncryptor/homebrew-tap` (formula bumped by a workflow) → npm: `kestrel-tui` (launcher) plus `kestrel-tui-<os>-<arch>` packages installed through `optionalDependencies` with `os`/`cpu` fields (the esbuild/Biome pattern) |
| Installer | POSIX `sh` with `set -eu`. Detects `uname -s`/`-m`, downloads the tarball and checksums, checks with `shasum -a 256` or `sha256sum`, installs to `$KESTREL_INSTALL_DIR` or `~/.local/bin`, and prints a PATH hint. It never uses sudo |
| macOS signing | Bun signs arm64 binaries ad hoc. Notarization is deferred to v1.1, since curl and brew installs don't trigger Gatekeeper |

## 14. Repository history

Kestrel was developed privately before this repository existed (M0–M3). Its history was reconstructed
here as **small, module-by-module commits in dependency order**: scaffold, docs, platform, sampler,
store, system control, config, process manager, stack, composition and actions, CLI, UI logic, UI,
end-to-end scripts. Every commit passes its own tests, so the history can be bisected. Later work
lands as ordinary commits.

Releases run from `.github/workflows/release.yml` ([RELEASING.md](../RELEASING.md)): a `v*` tag, a
`release` environment that needs a maintainer's approval (the only place a publishing credential may
live, as an environment secret), a `Release tags` ruleset, and npm trusted publishing after the first
release, so no long-lived npm token exists. v0.1.0 was released on 2026-09-29.

Repository settings: `Protect main` (no force-push or deletion, no bypass) and `Require CI on main`
(changes through a pull request with a green `CI result`; maintainers may push directly), private
vulnerability reporting (the channel SECURITY.md names), Dependabot alerts and security updates, and
secret scanning with push protection.

## 15. Logic ported from the prototype

The prototype was removed in M0. These pieces of proven logic were carried into the new files, each
with new tests written against the v2 spec:

| Prototype | Now in | What survived |
|---|---|---|
| `collector/macos.js` | `platform/darwin.js` | The `ps` row regex, state labels, and `hw.memsize` parsing. `top -l 1` was replaced by `os.cpus()` deltas and `vm_stat` |
| `store/index.js` | `store/index.js`, `store/selectors.js`, `sampler/index.js` | Immutable `commit()`, `applyView` / `reconcileSelection`, and the in-flight tick guard |
| `processManager/*` | `processManager/*` | Process groups, the operation queue, backoff, the log buffer (now structured lines), `deriveId`, and all 15 lifecycle test scenarios |
| `systemControl/index.js` | `systemControl/index.js` | Signal allowlist, pid and priority validation, and error translation. `renice` is now async |
| `actions/index.js` | `actions/index.js` | The `{ ok, data, error }` envelope (now also with `code`) |

## 16. Open questions

| # | Question | Default if not decided |
|---|---|---|
| 1 | Where does the Homebrew tap live? | `3ncryptor/homebrew-tap`, next to this repository |

Resolved: license is **MIT** (`LICENSE` added in M0). Git history: **none kept**, and the first commit happens in the new repo.
