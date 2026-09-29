# kestrel-tui

**A system monitor and a process manager in one terminal app, for macOS and Linux.**

[![npm version](https://img.shields.io/npm/v/kestrel-tui.svg)](https://www.npmjs.com/package/kestrel-tui)
[![npm downloads](https://img.shields.io/npm/dm/kestrel-tui.svg)](https://www.npmjs.com/package/kestrel-tui)
[![CI](https://github.com/3ncryptor/kestrel/actions/workflows/ci.yml/badge.svg)](https://github.com/3ncryptor/kestrel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/3ncryptor/kestrel/blob/main/LICENSE)

Kestrel shows what is using your machine, the way htop and btop do. It also starts and supervises your
project's processes, the way pm2 or foreman do. Because it does both, it can tell you that *your*
`api` is the process holding 1.2 GB and climbing, and which port it listens on.

```text
╭─ cpu ─────────────────────────────────────────────── load 2.4 2.1 1.9 · up 3d 4h ─╮
│ ⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣠⣶⣿⣿⣿⣶⣤⡀⠀⠀⠀⣀⣠⣤⣤⣄⠀⠀⡄   C0 ■■■─────── 34%  C4 ■■■■■───── 48% │
│ ⠀⠀⠀⠀⣀⣀⡀⡇⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣤⣤⣄⣀⣀⣀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⡇   C1 ■■■■■■■─── 71%  C5 ■■──────── 15% │
│ ⣶⣶⣾⣿⣿⣿⣿⣷⣤⣀⣀⣀⣀⣀⣴⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿   C2 ■■──────── 22%  C6 ■■■■■■──── 63% │
│ CPU 20%                                       C3 ■───────── 9%   C7 ■■■─────── 27% │
╰────────────────────────────────────────────────────────────────────────────────────╯
╭─ mem ────────────── 16.0 GB ─╮╭─ logs · api ─────────────────── following ● ─ 8 lines ─╮
│ Used  ■■■■■■■■──────  9.6 GB ││  15:33:16 api listening on http://localhost:3000       │
│ Swap  ■■────────────  256 MB ││  15:33:17 GET /health 200 2ms                          │
╰──────────────────────────────╯│  15:33:20 POST /login 401 9ms                          │
╭─ managed · myapp ────── 2/4 ─╮│ ▎15:33:22 (node:812) DeprecationWarning: punycode is … │
│  ● db     ready :5432    3%  ││  15:33:25 [kestrel] worker crashed (code 1), restarting │
│ ▌● api    ready :3000   18%  ││  15:33:26 GET /health 200 1ms                          │
│  ↻ worker retry 2 in 4s      ││                                                        │
│  ⊘ cron   blocked by worker  ││                                                        │
╰─ s start ─ x stop ───────────╯╰─ f follow ─ / search ─ v all / one ─ PgUp older ───────╯
```

## Contents

- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands and options](#commands-and-options)
- [Running a stack](#running-a-stack)
- [Keys](#keys)
- [How this package works](#how-this-package-works)
- [Verifying what you installed](#verifying-what-you-installed)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Links](#links)

## Features

- **See the machine.** CPU history and per-core meters, memory and swap, listening TCP ports with the
  process that owns each, and a process table or tree with filter, sort, a details drawer, kill and
  renice.
- **Run the stack.** Starts the processes in `kestrel.json` (or a Procfile, or package.json scripts) in
  dependency order, waits until each is ready (a port, an HTTP check or a log line), restarts crashes
  with backoff, and stops everything cleanly in reverse order.
- **Follow it.** A live logs panel per process, or all of them interleaved, with pause and search.
  Logs are also saved to `.kestrel/logs/`, and each managed process shows the CPU and memory of its
  whole process tree, with a hint when its memory keeps climbing.
- **Stay safe.** Every kill and renice goes through confirmations: one key for your own processes, the
  exact name typed for system processes, and Kestrel itself and PID 1 are blocked. After a crash,
  Kestrel finds the processes it left running and offers to stop them.
- **Anywhere.** One standalone binary. It works over SSH, on an EC2 instance or a Raspberry Pi, and in
  16-colour and no-colour terminals.

## Install

```sh
npm install -g kestrel-tui
```

That installs the `kestrel` command. You can also try it without installing:

```sh
npx kestrel-tui
```

**Supported platforms**

| | macOS 13 or newer | Linux with glibc |
|---|---|---|
| **arm64** | Apple Silicon | AWS Graviton, Raspberry Pi (64-bit OS) |
| **x64** | Intel Macs | most servers and desktops |

Node.js 18 or newer is needed only to launch the binary; Kestrel itself does not run on Node. Windows is
not supported (use WSL2), and neither are musl-based distributions such as Alpine.

**Without npm**, the same binary installs with a checksum-verifying script:

```sh
curl -fsSL https://raw.githubusercontent.com/3ncryptor/kestrel/main/packaging/install.sh | sh
```

## Quick start

```sh
kestrel              # the dashboard: this machine, plus this folder's stack (idle until you start it)
kestrel sm           # the system monitor only
cd my-project
kestrel init         # writes kestrel.json from a Procfile or package.json scripts
kestrel pm           # starts the stack and opens the process manager
kestrel doctor       # checks the machine, the terminal and the config
```

Press `?` anywhere in the app to see every key.

## Commands and options

| Command | What it does |
|---|---|
| `kestrel` | The dashboard. The project's stack is shown idle; `a` starts it all, `s` starts one process |
| `kestrel pm` | Starts the project's stack and opens the dashboard on it (aliases `-pm`, `--pm`) |
| `kestrel sm` | The system monitor only; never reads or runs a config (aliases `-sm`, `--sm`) |
| `kestrel init` | Writes `kestrel.json` from a Procfile, package.json scripts or a command you type |
| `kestrel import pm2 [file]` | Converts a running pm2, or a pm2 ecosystem file, into `kestrel.json` |
| `kestrel doctor` | Checks what Kestrel needs on this machine and says how to fix what is missing |
| `kestrel update [--check]` | Updates a standalone (curl) install; for an npm install it prints the npm command |

| Option | Meaning |
|---|---|
| `--config <path>` | Use this `kestrel.json` instead of searching for one |
| `--only <a,b>` | `pm`: start only these processes |
| `--interval <ms>` | Refresh interval, 250 to 60000 (default 1000) |
| `--force` | `init`, `import`: replace an existing `kestrel.json` |
| `-y`, `--yes` | `init`: take the defaults; `import`: agree to read a `.js` ecosystem file |
| `--no-color` | Plain output; the `NO_COLOR` environment variable is respected too |
| `-h`, `--help` / `-v`, `--version` | Help and version |

`kestrel sm --dump --ticks N` prints N JSON snapshots and exits, which is handy for scripts.

## Running a stack

A stack is the set of processes a project needs, described in `kestrel.json`:

```json
{
  "version": 1,
  "processes": {
    "db": {
      "cmd": "docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16",
      "ready": { "port": 5432 }
    },
    "api": {
      "cmd": "npm run dev",
      "dependsOn": ["db"],
      "ready": { "http": "http://localhost:3000/health" }
    },
    "worker": { "cmd": "node worker.js", "dependsOn": ["api"], "restart": "always" }
  }
}
```

- Kestrel looks for `--config`, then `kestrel.json` in this folder or any parent, then a `Procfile`,
  then package.json scripts (you choose which to run).
- `dependsOn` sets the start order; a process starts once everything it depends on is ready.
- `ready` is a port, an HTTP URL or a log line (`"log": "listening on"`).
- `restart` is `on-failure` (the default), `always` or `never`, with backoff and a `maxRestarts` limit.
- `env` and `envFile` set environment variables; values are masked in the UI until you reveal them.
- An invalid config is reported with every problem and its path, and `kestrel pm` exits with code 2,
  so the same check works in CI.

Every option and its default: [configuration reference](https://github.com/3ncryptor/kestrel/blob/main/docs/CONFIG.md).
To keep a stack running after you log out of a server, run `kestrel pm` inside `tmux`.

## Keys

| Where | Keys |
|---|---|
| Everywhere | `Tab` next box · `?` help · `Esc` back · `q` quit (asks before stopping a running stack) · `L` logs of a failed process |
| Process table | `↑↓` select · `/` filter · `s` sort (`S` reverse) · `t` tree · `⏎` details · `x` kill (`X` force) · `r` renice |
| Ports | `↑↓` select · `⏎` jump to the owner · `x` kill the owner · `/` filter |
| Managed box | `↑↓` select · `s` start · `x` stop · `r` restart · `a` start all · `X` stop all · `n` new · `e` env · `w` save |
| Logs panel | `f` follow · `/` search · `v` all processes or one · `PgUp`/`PgDn` scroll · `g`/`G` oldest/newest |

The help screen (`?`) is generated from the key bindings, so it always matches what the keys do.

## How this package works

`kestrel-tui` is a small launcher. The program itself is a standalone binary, published as one package
per platform:

| Package | Platform |
|---|---|
| [`kestrel-tui-darwin-arm64`](https://www.npmjs.com/package/kestrel-tui-darwin-arm64) | macOS, Apple Silicon |
| [`kestrel-tui-darwin-x64`](https://www.npmjs.com/package/kestrel-tui-darwin-x64) | macOS, Intel |
| [`kestrel-tui-linux-arm64`](https://www.npmjs.com/package/kestrel-tui-linux-arm64) | Linux, arm64 |
| [`kestrel-tui-linux-x64`](https://www.npmjs.com/package/kestrel-tui-linux-x64) | Linux, x64 |

They are `optionalDependencies` with `os` and `cpu` fields, so npm downloads only the one for your
machine (a 27 to 39 MB download, 72 to 97 MB on disk). **No install scripts run**: nothing executes during `npm install`. When you run
`kestrel`, the launcher finds the binary for your platform and runs it with your terminal attached,
passing through arguments, signals and the exit code. All five packages always have the same version.

## Verifying what you installed

Every release is built by GitHub Actions from a tagged commit of
[3ncryptor/kestrel](https://github.com/3ncryptor/kestrel), and published with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements): the npm page of each package
links to the exact workflow run and commit it came from. To check the signatures and provenance of an
install:

```sh
npm audit signatures        # in a project that depends on kestrel-tui
```

The release archives on GitHub carry build attestations too
(`gh attestation verify <archive> --repo 3ncryptor/kestrel`).

## Updating and uninstalling

```sh
npm install -g kestrel-tui@latest     # update
npm uninstall -g kestrel-tui          # uninstall
```

A project's saved logs and run state live in its `.kestrel/` folder (`kestrel init` offers to add it to
`.gitignore`); delete that folder to remove them.

## Troubleshooting

**`kestrel: kestrel-tui-<platform> is not installed`.** npm skipped the platform package. That happens
when optional dependencies are turned off (`--omit=optional`, `--no-optional`, or `omit=optional` in
`.npmrc`), or on a platform without a build. Reinstall with optional dependencies enabled:
`npm install -g kestrel-tui --include=optional`.

**`EBADPLATFORM` on Windows, or a binary that won't start on Alpine.** Kestrel supports macOS and
glibc-based Linux on arm64 and x64. On Windows, install it inside WSL2; on Alpine (musl), use a
glibc-based image such as Debian slim.

**Other users' processes show no CPU or memory on macOS.** macOS only shares those figures with root.
Kestrel samples them every 5 seconds from `ps`; run it with `sudo` to see everything.

**Anything else.** Run `kestrel doctor`: it checks the runtime, sampling, ports, the terminal and your
config, and says how to fix each problem. When you
[open an issue](https://github.com/3ncryptor/kestrel/issues/new/choose), include its output.

## Privacy

Kestrel sends no telemetry and has no analytics. It uses the network only for the readiness checks you
configure (a port or an HTTP URL, usually on localhost) and when you run `kestrel update`, which asks
GitHub for the latest release.

## Links

- Source and issues: https://github.com/3ncryptor/kestrel
- Changelog: https://github.com/3ncryptor/kestrel/blob/main/CHANGELOG.md
- Configuration reference: https://github.com/3ncryptor/kestrel/blob/main/docs/CONFIG.md
- Security policy: https://github.com/3ncryptor/kestrel/blob/main/SECURITY.md
- Contributing: https://github.com/3ncryptor/kestrel/blob/main/CONTRIBUTING.md

## License

[MIT](https://github.com/3ncryptor/kestrel/blob/main/LICENSE) © Aryan Vibhuti
