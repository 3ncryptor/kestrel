# Configuration reference

Kestrel runs a **stack**: the processes a project needs, described in `kestrel.json`. Every value
below is checked when the file loads. `kestrel pm` and `kestrel doctor` report *every* problem with
its path (for example `processes.api.ready.port  must be a port number (1-65535)`), and `kestrel pm`
exits with code 2, so the same check works in CI.

## Where Kestrel looks

The first match wins:

1. `--config <path>`
2. `kestrel.json` in the current directory or any parent directory (like git)
3. a `Procfile` in the current directory
4. `package.json` scripts in the current directory (you pick which ones to run; `kestrel init` saves
   the choice as `kestrel.json`)

Paths inside the file (`cwd`, `envFile`) are relative to the folder that contains it.

## Example

```json
{
  "version": 1,
  "processes": {
    "db": {
      "cmd": "docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16",
      "ready": { "port": 5432 },
      "stopTimeoutMs": 15000
    },
    "api": {
      "cmd": "npm run dev",
      "cwd": "api",
      "dependsOn": ["db"],
      "env": { "LOG_LEVEL": "debug" },
      "ready": { "http": "http://localhost:3000/health", "timeoutMs": 30000 }
    },
    "worker": {
      "cmd": "node worker.js",
      "dependsOn": ["api"],
      "ready": { "log": "worker ready" },
      "restart": "always"
    }
  },
  "monitor": { "intervalMs": 1000, "thresholds": { "cpu": [50, 80], "memMB": [500, 1500] } }
}
```

## Top level

| Key | Required | Meaning |
|---|---|---|
| `version` | yes | Always `1` |
| `processes` | yes | At least one process, keyed by name |
| `monitor` | no | Refresh interval and highlight thresholds (below) |
| `$schema` | no | Ignored; lets editors attach a schema |

Unknown keys are errors, so typos don't fail silently.

## Processes

A process name uses letters, digits, `.`, `_` and `-` (at most 64 characters).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `cmd` | string | required | The command, run through your shell (`sh -c`), like an npm script |
| `cwd` | path | the config's folder | Working directory |
| `env` | object | `{}` | Extra variables; values may be strings, numbers or booleans |
| `envFile` | path | `.env` in `cwd`, if present | Variables loaded from a dotenv file. A file you name explicitly must exist |
| `dependsOn` | string[] | `[]` | Processes that must be ready before this one starts |
| `ready` | object | none | How Kestrel knows the process is up (below) |
| `restart` | `on-failure` \| `always` \| `never` | `on-failure` | When to restart after it exits |
| `maxRestarts` | integer ≥ 0 | `10` | Consecutive crashes before giving up (the process is then `errored`) |
| `stopSignal` | `SIGTERM` `SIGINT` `SIGHUP` `SIGQUIT` `SIGUSR1` `SIGUSR2` | `SIGTERM` | The signal a stop sends first |
| `stopTimeoutMs` | integer ≥ 1 | `5000` | How long to wait before SIGKILL |

Each process runs in its own process group. Stopping it also stops everything it started, and
anything it leaves running when it exits is cleaned up. Commands that daemonize themselves (fork and
exit) aren't supported, which is the same as pm2 and systemd `Type=simple`; run them in the foreground.

### Readiness

Exactly one of:

| Check | Example | Passes when |
|---|---|---|
| `port` | `{ "port": 5432 }` | Something accepts a TCP connection on localhost (127.0.0.1, then ::1) |
| `http` | `{ "http": "http://localhost:3000/health" }` | A GET answers 2xx or 3xx within 2 s (redirects are not followed) |
| `log` | `{ "log": "listening on" }` | An output line matches this text or regular expression |

Checks repeat every 500 ms until `timeoutMs` (default `60000`). A process without a check counts as
ready as soon as it starts. A process that times out is `unready`: it keeps running, but its
dependents stay `blocked`.

### Restarts

- `on-failure` restarts after a non-zero exit, `always` after any exit, `never` leaves it stopped.
- Restarts back off exponentially from 1 s up to 30 s. The crash streak resets after 30 s of stable
  running.
- After `maxRestarts` consecutive crashes the process is `errored` and an alert says so (`L` in the
  dashboard jumps to its logs). Starting it again by hand resets the streak.

### Dependencies

Processes start in **waves**: a wave starts once every process in the previous one is ready.
- A cycle (`api → worker → api`) is rejected with the cycle named.
- If a dependency fails (errored, unready, stopped), its dependents are `blocked by <name>`. They start
  by themselves once it recovers.
- Stopping goes in reverse order, and processes in the same wave stop in parallel.

### Environment

Precedence, lowest first: the environment Kestrel was started with, then `envFile`, then `env`.
The dotenv format supports `KEY=value`, `export KEY=value`, `# comments`, single quotes (literal) and
double quotes (with `\n`-style escapes). An unquoted value ends at ` #`, so URLs with fragments survive.
Multi-line values aren't supported. The dashboard masks values until you reveal them (`e`, then `r`).

## Monitor

| Key | Default | Meaning |
|---|---|---|
| `monitor.intervalMs` | `1000` | Refresh interval, 250–60000 ms (`--interval` overrides it) |
| `monitor.thresholds.cpu` | `[50, 80]` | `[warn, danger]` in % of one core, for highlighting |
| `monitor.thresholds.memMB` | `[500, 1500]` | `[warn, danger]` in MB |

## Other stack sources

- **Procfile:** `name: command` lines, with `#` comments and blank lines ignored. Each line becomes a
  process with the defaults above.
- **package.json:** long-running scripts (`dev`, `start`, `serve`, `watch`, `worker`, and scripts using
  `--watch` or `nodemon`) are preselected in the picker. Lifecycle scripts (`install`, `prepare`,
  `pre*`/`post*` hooks) are never offered. Scripts run with the lockfile's package manager (bun, pnpm,
  yarn or npm).
- **pm2:** `kestrel import pm2 [ecosystem file]` converts a running pm2 (`pm2 jlist`) or an ecosystem
  file into `kestrel.json`, and lists what it could not convert. A `.js` ecosystem file is only executed
  after you confirm.

## Files Kestrel writes

Everything lives in `.kestrel/` next to the config. `kestrel init` offers to add it to `.gitignore`.

| File | Contents |
|---|---|
| `.kestrel/logs/<name>.log` | Each output line as `ISO-time stream text`. Owner-only (0600, folder 0700), rotated at 10 MB, 3 kept |
| `.kestrel/run.json` | The processes Kestrel started (pid, process group, start time). After a hard crash, the next start offers to stop the ones still running, verified by start time so a reused pid is never touched |
