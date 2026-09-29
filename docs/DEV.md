# Developing Kestrel

## Requirements

| Tool | Version | Why |
|---|---|---|
| Bun | ≥ 1.3 | Runs the CLI and (from M2) the OpenTUI interface |
| Node.js | ≥ 20 | Runs the core test suite; the core must work on both runtimes |
| Docker | any | Linux testing on a Mac (optional, but required before a milestone review) |

```sh
./setup.sh          # checks the tools, installs Bun and the dependencies (plus the husky pre-commit hook), a `kestrel` command
```

On Windows use WSL2 for everything below (see CONTRIBUTING.md); Git Bash covers lint and types.

## Everyday commands

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests under Node (`tests/unit`, `tests/integration`) |
| `npm run test:bun` | The same suite under Bun |
| `npm run test:coverage` | Node's coverage report (target ≥ 80% for `core/` and `cli/`) |
| `npm run typecheck` | `tsc` over the JSDoc types in `core/` and `cli/` (strict) |
| `npm start` | The btop-style dashboard, React production build (a stack here is shown idle) |
| `npm run demo` | The process manager on the demo stack: db (port), api (http, needs db), worker (log line), flaky (crash loop) |
| `npm run pm` / `npm run sm` / `npm run doctor` | The process manager for this folder / the monitor only / the environment check |
| `npm run pm -- --only api` | Flags go after `--`: npm keeps the ones before it (`npm start --pm` opens the plain dashboard) |
| `kestrel …` | After `./setup.sh` (bun link): the real command, running this checkout in production mode |
| `npm run dev` | Same UI with React's development build (clearer errors, ~2× the CPU) |
| `npm run test:ui` | UI frame tests (Bun + OpenTUI test renderer) |
| `bun cli/index.js sm --dump --ticks 3` | Headless: prints 3 JSON snapshots of the live system |
| `NODE_ENV=production bun scripts/bench-ui.jsx` | UI CPU per frame (the real App, headless renderer, realistic ticks) |
| `bun scripts/bench.js 30` | Engine CPU over 30 s **including the processes it spawns** (ps, lsof…), RSS and tick cost, against the < 1% budget; exits 1 when over |
| `bun cli/index.js --help` | CLI usage |

## CI

`.github/workflows/ci.yml` starts with a job that classifies the diff (`scripts/ci-changes.sh`, tested
by `tests/unit/ci-changes.test.js`), and the other jobs run only when that part of the code changed. A
docs-only change runs no jobs at all. See the table in CONTRIBUTING.md. To test everything regardless,
run the workflow by hand (Actions → CI → Run workflow). CodeQL skips docs-only changes and Scorecard
runs weekly.

Releases have their own workflow, `.github/workflows/release.yml`; see [RELEASING.md](../RELEASING.md).
To rehearse the npm part on your machine (Node 22+), with tarballs from a release run's `release`
artifact: `sh scripts/npm-rehearse.sh <dir>/npm`. It uses a throwaway local registry, never npmjs.com.

## End to end, in a real terminal

```sh
scripts/e2e/pm-e2e.sh      # kestrel pm on the demo stack in a PTY: ready → q → y → nothing left running
```

`scripts/e2e/pty-frames.py` drives any command in a pseudo-terminal and prints the screen at chosen
moments (a minimal emulator: enough for OpenTUI's output), e.g.
`PTY_SECONDS=8 PTY_SNAPSHOTS='[4]' PTY_SCRIPT='[[5,"q"]]' python3 scripts/e2e/pty-frames.py bun cli/index.js`.

## Linux on a Mac

```sh
scripts/docker-test.sh              # tests + live snapshot in Debian (node:20) and Amazon Linux 2023
scripts/docker-e2e.sh               # the PTY end-to-end check in both images (installs bun; needs network)
scripts/capture-linux-fixtures.sh   # refresh tests/fixtures/linux/captured/ from a real kernel
```

Neither image ships `ss`, so both exercise the `/proc/net/tcp` fallback for the ports view. Try other
images with `KESTREL_TEST_IMAGES="ubuntu:24.04 debian:12" scripts/docker-test.sh` (the image needs
`node`, or `dnf` to install it).

## Measuring the interactive UI

The UI needs a real terminal, so it is measured in a pseudo-terminal with the cumulative CPU time from
`ps -o time=` over 60 s. That figure covers Kestrel's own process only. Add the cost of the processes it
spawns, which `scripts/bench.js` measures for the engine. Before M4 they were most of the total, and
leaving them out once made a real ~5% look like 2.6%. **Always set `NODE_ENV=production` at process start** (as `npm start` does): Bun
fixes the JSX transform when the process starts, so changing it later crashes the UI. Check the capture
shows the screen actually rendered: a crashed UI costs almost nothing and makes the numbers look great.
Current numbers: BUILD_PLAN §11.1 (dashboard) and §11.2 (`kestrel pm` with streaming logs).

## Where things live

See [BUILD_PLAN.md §5](BUILD_PLAN.md#5-repository-structure-target). In short:

- `core/` is the engine and has no UI dependencies. The only way in is `core/index.js` → `createKestrel()`, which returns `{ store, actions }`.
- `cli/` handles argument parsing and command dispatch.
- `ui/` is the OpenTUI interface: a btop-style dashboard (`ui/screens/Dashboard.jsx`). It talks only to `store` and `actions`.

## Rules for changes

- Write tests first. Parsers are tested against fixture text, so tests never depend on what the machine is doing.
- **The store and actions contract is frozen** (`core/store/types.js`, checked by `tests/unit/contract.test.js`). To change it, update BUILD_PLAN §6, the types and the contract test together.
- Kestrel's own OS calls use `execFile` with argument arrays and never a shell. Only commands from the user's stack config run through a shell.
- Child output is untrusted text: the UI strips escape sequences before drawing it (`ui/logic/logs.js`).
- A managed process's state lives in its `Supervisor` (`core/processManager/supervisor.js`); stack-wide
  ordering in `core/stack/orchestrator.js`; config, orphans and stack state in `core/stack/session.js`.
- State updates are immutable. Files stay under 400 lines and functions under 50.
