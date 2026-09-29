# Kestrel

**A system monitor and a process manager in one terminal app, for macOS and Linux.**

[![CI](https://github.com/3ncryptor/kestrel/actions/workflows/ci.yml/badge.svg)](https://github.com/3ncryptor/kestrel/actions/workflows/ci.yml)
[![CodeQL](https://github.com/3ncryptor/kestrel/actions/workflows/codeql.yml/badge.svg)](https://github.com/3ncryptor/kestrel/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange.svg)

Kestrel shows what is using your machine, the way htop and btop do. It also starts and supervises your
project's processes, the way pm2 or foreman do. Because it does both, it can tell you that *your*
`api` is the process holding 1.2 GB and climbing, and which port it listens on.

```text
╭─ cpu ────────────────────────────────────────────────────────────── load 2.4 2.1 1.9 · up 3d 4h ─╮
│ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ C0  ■■■───────  34%  C6  ■■■■■■────  63%   │
│ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ C1  ■■■■■■■───  71%  C7  ■■■───────  27%   │
│ ⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣠⣶⣿⣿⣿⣶⣤⡀⠀⠀⠀⣀⣠⣤⣤⣄⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⠀ C2  ■■────────  22%                        │
│ ⠀⠀⠀⠀⣀⣀⡀⡇⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣤⣤⣄⣀⣀⣀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⡇⠀⠀⠀⠀⠀⠀⠀⠀ C3  ■─────────   9%                        │
│ ⣶⣶⣾⣿⣿⣿⣿⣷⣤⣀⣀⣀⣀⣀⣴⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣄⣀⣤⣴⣾⣿⣿ C4  ■■■■■─────  48%                        │
│ CPU 20%                                               C5  ■■────────  15%                        │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ mem ────────────── 16.0 GB ─╮╭─ logs · api ───────────────────────────── following ● ─ 8 lines ─╮
│ Used  ■■■■■■■■──────  9.6 GB ││  15:33:16 api listening on http://localhost:3000                 │
│ Cache ■■■───────────  3.1 GB ││  15:33:17 GET /health 200 2ms                                    │
│ Free  ■■■■■■────────  6.4 GB ││  15:33:19 GET /users 200 18ms                                    │
│ Swap  ■■────────────  256 MB ││  15:33:20 POST /login 401 9ms                                    │
╰──────────────────────────────╯│ ▎15:33:22 (node:812) DeprecationWarning: punycode is deprecated  │
╭─ managed · myapp ────── 2/4 ─╮│  15:33:23 GET /users/42 200 11ms                                 │
│  ● db     ready :5432    3%  ││  15:33:25 [kestrel] worker crashed (code 1), restarting in 4s    │
│ ▌● api    ready :3000   18%  ││  15:33:26 GET /health 200 1ms                                    │
│  ↻ worker retry 2 in 4s      ││                                                                  │
│  ⊘ cron   blocked by worker  ││                                                                  │
╰─ s start ─ x stop ───────────╯│                                                                  │
╭─ ports ────────────────── 2 ─╮│                                                                  │
│ :3000  node  ◆api 127.0.0.1  ││                                                                  │
│ :5432  postg… ◆db *          ││                                                                  │
│                              ││                                                                  │
│                              ││                                                                  │
│                              ││                                                                  │
│                              ││                                                                  │
╰──────────────────────────────╯╰─ f follow ─ / search ─ v all / one ─ PgUp older ─ PgDn newer ────╯
```

## Features

- **See the machine.** CPU history and per-core meters, memory and swap, listening ports with their
  owners, and a process table or tree with filter, sort, details, kill and renice.
- **Run the stack.**
  - Starts the processes in `kestrel.json` (or a Procfile, or package.json scripts) in dependency order.
  - Waits for each to be ready (a port, an HTTP check or a log line) and restarts crashes with backoff.
  - Stops everything cleanly, in reverse order.
- **Follow it.** A live logs panel per process or interleaved for all of them, with pause and search.
  Logs are also saved to `.kestrel/logs/`, and each managed process shows the CPU and memory of its
  whole process tree.
- **Stay safe.** Every kill and renice goes through confirmations enforced in the engine: one key for
  your own processes, the exact name typed for system processes, and Kestrel itself and PID 1 are
  blocked. After a crash, Kestrel finds the processes it left running and offers to stop them.
- **Anywhere.** A single binary, with nothing else to install on the machine. It works over SSH, on an
  EC2 box or a Raspberry Pi, and in 16-colour and no-colour terminals.

## Getting started

> Kestrel isn't released yet. Binaries, an installer, npm and Homebrew packages are prepared in this
> repository but not published. Until then, run it from source.

You need [Bun](https://bun.sh) 1.4 (and Node.js 20+ if you want to run the tests).

```sh
git clone https://github.com/3ncryptor/kestrel.git && cd kestrel
bun install
npm start                  # the dashboard
npm start -- pm --config tests/fixtures/stack/kestrel.json   # a demo stack
```

To get a standalone `kestrel` binary for your machine:

```sh
bun run build              # dist/kestrel-<os>-<arch>, smoke-tested
cp dist/kestrel-* ~/.local/bin/kestrel
kestrel doctor             # checks the machine, the terminal and the project's config
```

## Commands

| Command | What it does |
|---|---|
| `kestrel` | The dashboard. This project's stack is shown idle; `a` starts it all, `s` starts one process |
| `kestrel pm` | Starts this project's stack and opens the dashboard on it (`--only api,web`, `--config path`) |
| `kestrel sm` | The system monitor only; never reads or runs a config |
| `kestrel init` | Writes `kestrel.json` from a Procfile, package.json scripts or a command you type |
| `kestrel import pm2 [file]` | Converts a running pm2 or an ecosystem file into `kestrel.json` |
| `kestrel doctor` | Checks what Kestrel needs here and says how to fix what is missing |
| `kestrel update` | Updates a standalone install to the latest release (checksum-verified) |

`-pm`, `--pm`, `-sm` and `--sm` also work. Press `?` in the dashboard for every key.

## A stack

```json
{
  "version": 1,
  "processes": {
    "db":  { "cmd": "docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16", "ready": { "port": 5432 } },
    "api": { "cmd": "npm run dev", "dependsOn": ["db"], "ready": { "http": "http://localhost:3000/health" } },
    "worker": { "cmd": "node worker.js", "dependsOn": ["api"], "restart": "always" }
  }
}
```

Every option, with its default, is in the [configuration reference](docs/CONFIG.md). A Procfile or
package.json scripts work without any config. To keep a stack running after you log out of a server,
run `kestrel pm` inside `tmux`.

## Platforms

| | macOS 13+ | Linux (glibc) |
|---|---|---|
| arm64 | ✓ Apple Silicon | ✓ Graviton, Raspberry Pi 4/5 |
| x64 | ✓ Intel | ✓ |
| Sampling | libproc through Bun's FFI; other users' processes every 5 s (macOS limits this to root) | `/proc` |

Kestrel's own footprint is about 3% of one core and 80 MB for the full dashboard. Measurements and the
roadmap to 1% are in [BUILD_PLAN §11](docs/BUILD_PLAN.md#11-quality-testing-and-performance).

## Documentation

| Document | What it covers |
|---|---|
| [docs/CONFIG.md](docs/CONFIG.md) | Every `kestrel.json` option |
| [docs/PRD.md](docs/PRD.md) | What Kestrel is for, and the product decisions |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | Layout, keys, colours and every screen state |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Architecture, the engine/UI contract, performance, distribution |
| [docs/DEV.md](docs/DEV.md) | Development commands, Linux testing on a Mac, measuring |

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report security
problems privately, as described in [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE) © Aryan Vibhuti
