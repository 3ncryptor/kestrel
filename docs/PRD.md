# Kestrel — Product Requirements Document

| | |
|---|---|
| **Version** | 2.0 (supersedes the v1 PRD in `docs/archive/`) |
| **Status** | Approved for build |
| **Last updated** | 2026-09-28 |
| **Companion docs** | [BUILD_PLAN.md](BUILD_PLAN.md) (architecture and milestones) · [UI_SPEC.md](UI_SPEC.md) (design system and screens) |

---

## 1. Vision

**Kestrel is a portable ops cockpit for the terminal.** Install one binary on your Mac or on any Linux
server (an EC2 box, a VPS, a Raspberry Pi) and you get two things in one tool:

1. **A system monitor** in the tradition of `htop`/`btop`: what is using this machine, right now and over the last minute.
2. **A process manager** in the tradition of `pm2`/`foreman`: start the project's whole stack with one command, keep it alive, and read its logs.

The two halves share one data model. Kestrel knows that *your* `api` process is the one using 1.2 GB
and climbing, which no monitor and no process manager tells you on its own.

> One-line pitch: **`kestrel pm` starts your stack, keeps it alive, and shows you what it's doing to the machine.**

## 2. Problem

Developers and solo deployers use several separate tools today:

| Need | Typical tool | What's missing |
|---|---|---|
| "What is using my CPU/RAM?" | `htop`, `btop`, Activity Monitor | No idea which processes belong to *my project*; can't start or restart them |
| "Run my dev stack" | several terminal tabs, `foreman`, `overmind`, `npm-run-all` | No resource view, weak crash recovery, logs scattered across tabs |
| "Keep my app alive on a server" | `pm2`, `systemd` | pm2 needs Node installed and runs a heavy daemon; systemd is powerful but hard to learn and gives no live overview |
| "What's on port 3000?" | `lsof -i :3000`, `ss -ltnp` | Flags nobody remembers; a separate step before you can kill it |

Switching between these costs attention every time. A crash in one terminal tab goes unnoticed, and a memory leak shows up only once the machine starts swapping.

## 3. Target users

| Persona | Context | What they need from Kestrel |
|---|---|---|
| **Local developer** (primary) | Mac, runs 2–6 processes per project (api, web, worker, db proxy) | One command to start everything, automatic restarts, all logs in one place, and a quick answer to "why is my fan spinning?" |
| **Solo deployer** | A small app on EC2/VPS, reached over SSH, with no Kubernetes | Install in seconds with nothing else needed, supervision, logs saved to disk, and a quick health check over SSH |
| **Terminal power user** | Lives in the terminal and already uses htop/btop | A monitor that looks and feels better than htop, with a process tree and a ports view |

## 4. Goals and non-goals

### Goals (v1)
- G1: Replace `htop` for day-to-day monitoring on macOS and Linux.
- G2: Replace `foreman`/`overmind`/"many tabs" for running a local dev stack.
- G3: Replace `pm2` for simple interactive supervision on a single server.
- G4: Install on any supported machine in **under 30 seconds** with **no runtime dependencies**.
- G5: Make switching free: read the user's existing Procfile, `package.json` scripts, or pm2 config.

### Non-goals (v1)
- Windows support.
- Remote or multi-machine monitoring, and web dashboards.
- A background daemon. Managed processes live only as long as Kestrel runs; v1.1 hands long-lived supervision to systemd instead (§9).
- Containers, Kubernetes, and cluster mode (pm2 `instances`).
- Disk I/O and network throughput graphs (roadmap).

## 5. Product surface

### 5.1 Command line

| Command | Aliases | Behavior |
|---|---|---|
| `kestrel` | — | Opens the **dashboard** (btop-style: cpu, mem, managed, ports, proc). The stack is shown `idle`: nothing starts until you press `a` (all) or `s` (the selected process). |
| `kestrel pm` | `-pm`, `--pm` | Finds the stack config, **starts the stack**, and opens the dashboard with the **managed box** focused |
| `kestrel sm` | `-sm`, `--sm` | Opens the dashboard **without** the managed box. Never reads or runs a stack config. |
| `kestrel init` | — | Detects a Procfile or `package.json` scripts, lets you pick processes, and writes `kestrel.json` |
| `kestrel import pm2 [file]` | — | Converts a running pm2 setup (`pm2 jlist`) or an ecosystem file into `kestrel.json` |
| `kestrel doctor` | — | Checks platform support, required system tools, terminal color depth, and config validity |
| `kestrel update` | — | Replaces the binary with the latest release after checking its checksum |
| `kestrel --version` / `--help` | `-v` / `-h` | Standard |

Common flags: `--config <path>`, `--only <name,name>` (pm), and `--no-color` (the `NO_COLOR` environment variable is also respected).

### 5.2 Where the stack comes from (first match wins)
1. `--config <path>`
2. `kestrel.json`, searched from the current directory up to the filesystem root, like git does
3. `Procfile` in the current directory
4. `package.json` scripts: an interactive picker offers to save the selection as `kestrel.json`

Running `kestrel pm` with none of these shows a guided empty state. It never fails silently.

### 5.3 Screens (details in [UI_SPEC.md](UI_SPEC.md))

One **btop-style dashboard** (decided at the M2 review, replacing the Overview/Monitor/Manager screens):

| Box | Purpose |
|---|---|
| **cpu** | Braille history graph of total CPU plus gradient meters per core |
| **mem** | Used / cache / free / swap meters |
| **ports** | TCP listeners, kill by port |
| **proc** | The full process table (flat or tree), filter, sort, details, kill and renice |
| **managed** (M3) | The stack: status, readiness and resources per process. While it has focus, the big panel shows its logs (follow, search, all processes) |

## 6. Features and requirements

Priority: **P0** is needed for v1 to ship, **P1** is planned for v1 and can slip to v1.1, **P2** is on the roadmap.

### 6.1 System Monitor

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| M1 | Live CPU and memory | P0 | Refreshes every 1 s by default. Values within ±5 percentage points of Activity Monitor or `htop` under steady load |
| M2 | History sparklines | P0 | The last 60 samples of CPU% and MEM% are drawn on the Overview and in the Monitor header |
| M3 | Per-core CPU | P0 | One meter per logical core. Wraps into a grid on narrow terminals |
| M4 | Process table | P0 | Sort by cpu/mem/pid/name/user, filter live by name/command/PID, keep the selection across refreshes, and keep row order stable |
| M5 | Threshold highlights | P0 | Rows and meters change color at warn/danger thresholds (defaults: CPU 50/80%, process MEM 500 MB/1.5 GB), configurable in `kestrel.json` |
| M6 | Process tree | P0 | Toggle between the flat and tree views. Subtrees can collapse. Sorting applies among siblings |
| M7 | Kill and renice with tiered safety | P0 | Your own processes: confirm with one key. Other users' or root processes: type the process name to confirm. PID 0/1 and Kestrel itself are blocked. Errors are reported in plain words, e.g. "needs sudo" |
| M8 | Ports view | P0 | Lists TCP listeners (port, address, PID, process name). Kill by port. When not running as root, it shows only the current user's processes and says so on screen |
| M9 | Process detail drawer | P1 | Full command line, parent chain, start time, and state for the selected process |

### 6.2 Process Manager

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| P1 | Stack start | P0 | `kestrel pm` starts every process in the config, in `dependsOn` order. Dependency cycles are rejected with the cycle named |
| P2 | Supervision and auto-restart | P0 | Restart policy `on-failure` (default), `always`, or `never`. Exponential backoff from 1 s to 30 s. The backoff streak resets after 30 s of stable running. After `maxRestarts` consecutive crashes the process goes to `errored` and restarts stop |
| P3 | Readiness checks | P0 | A process is `starting` until its check passes: `port` (TCP connect), `http` (2xx/3xx response), or `log` (a regex matches output). Dependents wait until it is ready. A timeout marks it `unready`, and dependents never start |
| P4 | Live logs | P0 | stdout and stderr for each process with timestamps. Follow mode on by default, and scrolling pauses it. An interleaved "all processes" view is available |
| P5 | Saved logs | P0 | Written to `.kestrel/logs/<name>.log` with file mode 0600, rotated at 10 MB with 3 files kept |
| P6 | Log search | P0 | `/` filters the visible log to lines matching a substring or `/regex/`, with a match count and highlighting |
| P7 | Resource link | P0 | CPU%, RSS, and child-process count for each managed process, **summed over its whole process tree** (so `npm run dev` includes node, esbuild, and the rest). Managed processes are marked in the Monitor table |
| P8 | Memory-leak hint | P1 | Flags a managed process whose memory has risen steadily for ≥10 minutes (thresholds in BUILD_PLAN §8.5). It is advisory only and never kills anything |
| P9 | Env loading | P0 | Precedence, lowest to highest: inherited environment, then `envFile` (default `.env`), then inline `env`. Values are masked in the UI unless you choose to reveal them |
| P10 | Manual control | P0 | Start, stop, and restart one process or all of them. Add a one-off command during a session; it isn't saved unless you save it |
| P11 | Clean shutdown | P0 | On quit, Ctrl+C, SIGTERM, or SIGHUP (such as an SSH disconnect), processes stop in reverse dependency order: SIGTERM to each process group, then SIGKILL after `stopTimeoutMs` |
| P12 | Orphan recovery | P1 | If Kestrel itself was killed hard, the next start finds processes left over from the previous run and offers to stop them |

### 6.3 Onboarding and migration

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| O1 | `kestrel init` | P0 | Detects a Procfile and `package.json` scripts, runs a multi-select picker, writes a valid `kestrel.json`, and offers to add `.kestrel/` to `.gitignore` |
| O2 | Procfile support | P0 | `name: command` lines, with comments and blank lines ignored. Works with `kestrel pm` without converting |
| O3 | pm2 import | P0 | Reads `pm2 jlist` if pm2 is installed, otherwise `ecosystem.config.{js,cjs,json}`. Maps name, script, args, cwd, env, autorestart, and max_restarts. Unsupported fields such as `instances` or `exec_mode: cluster` are listed as warnings. It only writes the file and never starts anything |
| O4 | `kestrel doctor` | P1 | Pass/fail report on OS/arch support, `ps`/`lsof`/`ss` availability, color depth, and config validation errors with line hints |

### 6.4 Distribution

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| D1 | Single binary | P0 | Self-contained builds for `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Nothing else needs to be installed |
| D2 | Install script | P0 | `curl -fsSL <url>/install.sh \| sh` detects the platform, checks the SHA-256 checksum, and installs to `~/.local/bin` without sudo |
| D3 | Homebrew tap | P0 | `brew install 3ncryptor/tap/kestrel`, with the formula updated automatically on each release |
| D4 | npm wrapper | P0 | `npm i -g kestrel-tui` or `npx kestrel-tui` installs the prebuilt binary for the platform. The npm package contains no source code |
| D5 | `kestrel update` | P1 | Updates the binary in place after a checksum check. Shows at most one new-version notice per day, and it can be turned off |
| D6 | Provenance | P0 | Every release has `checksums.txt` and a GitHub artifact attestation |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Cold start to first frame in under 300 ms. Kestrel's own CPU under 1% on idle refresh ticks. Kestrel's own memory under 80 MB. Handles 1,000+ processes without a visible slowdown. These budgets are checked in CI (BUILD_PLAN §11) |
| **Reliability** | A failed collector call never crashes the UI; it shows a banner and retries. A crashing managed process never affects Kestrel or other managed processes |
| **Security** | No telemetry. Signed checksums and attestations. Env values masked. Log files readable only by the owner. Commands run exactly as written in the user's config, and **plain `kestrel` never runs anything**. Kill and renice arguments are passed without a shell. Details in BUILD_PLAN §10 |
| **Accessibility** | Color is never the only signal (every status also has a glyph). `NO_COLOR` is respected. Everything works from the keyboard. Contrast ratio of at least 4.5:1 for text |
| **Compatibility** | Terminals of 80×24 or larger work fully; smaller terminals get a compact layout, with a "terminal too small" message below 60×16. Works over SSH with 256 colors, and with 16 colors in degraded mode |
| **Portability** | macOS 13+ and Linux (glibc) with kernel 4.x+. Amazon Linux 2023, Ubuntu 22.04+, and Debian 12 are tested in CI |

## 8. Success metrics

| Metric | Target |
|---|---|
| Time from `curl` to a running stack on a fresh EC2 instance | under 60 s |
| Time to see a crash and why it happened | shown within 1 refresh tick, and the last 50 log lines are one key away |
| Kestrel's own footprint | within the performance budgets in §7, at every release |
| Switching effort | a Procfile or pm2 user runs their stack with **zero manual edits** |
| Portfolio signal | README demo GIF, CI badges for both operating systems, published benchmark numbers |

## 9. Release plan

| Release | Scope |
|---|---|
| **v1.0** | Everything marked P0 in §6. Built in the four milestones in BUILD_PLAN §12 (about 5 weeks) |
| **v1.1** | P1 items that slipped. `kestrel export systemd`, which generates unit files so the OS keeps processes alive after SSH ends. musl/Alpine builds. Light theme. Reloading the config while running |
| **v2** | Optional daemon mode (pm2-style reattach). Disk and network I/O graphs. Remote attach over SSH. Windows only if users ask for it |

**Servers in v1:** processes live as long as Kestrel does. The documented pattern is:
`tmux new -s kestrel` → `kestrel pm` → detach with `Ctrl-b d`. The processes keep running after you log out.

## 10. Competitive positioning

| | htop | btop | pm2 | foreman/overmind | **Kestrel** |
|---|---|---|---|---|---|
| System monitor | ✔ | ✔ (good-looking) | basic | ✘ | ✔ |
| Process tree / ports | tree only | tree only | ✘ | ✘ | ✔ / ✔ |
| Start a whole stack | ✘ | ✘ | ✔ | ✔ | ✔ |
| Readiness and start order | ✘ | ✘ | partial | ✘ | ✔ |
| Resource use per managed app | ✘ | ✘ | ✔ | ✘ | ✔ (whole process tree) |
| Runtime needed | none | none | Node | Ruby / Go | **none** |
| Keeps running after logout | n/a | n/a | daemon | ✘ | tmux (v1), systemd (v1.1) |

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| OpenTUI is pre-1.0 (0.5.x), so APIs may change | High | Pin exact versions. The UI only talks to the store and actions interface, so a renderer swap wouldn't touch the core |
| macOS and Linux data sources behave differently (e.g. Linux `ps %cpu` is a lifetime average) | Certain | Platform adapter with fixture-based tests for each OS. Linux reads `/proc` directly (BUILD_PLAN §7) |
| The ports view needs root to see other users' processes | Certain | Degrade gracefully and explain on screen. Never ask for sudo inside the TUI |
| The binary is large (about 70 MB, mostly the bundled Bun runtime) | Medium | Accepted for zero dependencies. Downloads are compressed. Size is tracked per release |
| Scope is about 5 weeks against the original 2-week estimate | High | Each milestone produces something usable on its own. P1 items can slip to v1.1 without blocking v1 |
| Commands in a cloned repo's config run when the user types `kestrel pm` | Low | This is the same trust model as `npm run`. Plain `kestrel` runs them only when you press `a` or `s`; `kestrel sm` never reads the config. `kestrel import pm2` executes a `.js` ecosystem file only after a yes |

## 12. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-09-28 | Monitor-first product, with an Overview home screen and drill-in | The #1 daily job is "see what's eating my machine" |
| 2026-09-28 | macOS **and Linux** in v1 | Being able to run it on EC2 is central to the product |
| 2026-09-28 | Ship a compiled binary. npm is a wrapper only | OpenTUI needs Bun ≥1.3 or Node ≥26.4, which most machines don't have. Verified: `bun build --compile` produces a working 73 MB standalone binary |
| 2026-09-28 | Package name `kestrel-tui` on npm, command name `kestrel` | `kestrel` and `kestrel-cli` are taken on npm |
| 2026-09-28 | Subcommands (`pm`, `sm`) with `-pm` and `-sm` accepted as aliases | Under Unix conventions, `-pm` reads as `-p -m` |
| 2026-09-28 | No daemon in v1. tmux now, systemd export in v1.1 | A daemon is the largest and riskiest part to build; systemd already solves supervision after logout |
| 2026-09-28 | Quitting stops all managed processes | Predictable, and nothing is left orphaned. Same as `docker compose up` |
| 2026-09-28 | Procfile support and pm2 import in v1 | Makes switching free for existing users, and costs about a day |
| 2026-09-28 | Persistence in scope (`kestrel.json`, saved logs) | Reverses the v1 PRD. Needed for "one command starts everything" |
| 2026-09-28 | Soft-pastel semantic palette, dark theme first | Calm enough to leave open all day. Color carries meaning, not decoration |
| 2026-09-29 | **btop-style dashboard; Overview dropped**; gradient-colored meters and graphs everywhere | M2 review: the v1 UI had no real graphs, felt muted and unfamiliar to developers |
| 2026-09-29 | **Black background**, neutral grey surfaces; pastel accents kept | M2b review: the bluish Catppuccin base was not wanted |
| 2026-09-29 | Managed is a **box** on the dashboard; **its logs take the big panel** while it has focus | M3 plan: one familiar screen instead of a separate Manager screen; logs need the width |
| 2026-09-29 | Plain `kestrel` shows the stack **idle**; `a`/`s` start it | M3 plan: opening the dashboard must never start things by surprise |
| 2026-09-29 | After a hard crash the stack **waits for the orphan question** before starting | Found in M3 E2E testing: a new db would race the left-over one for its port |
| 2026-09-29 | **Ship first.** The < 1% CPU target is deferred: CI guards against regressions (4%), and 1% is the next optimisation goal | Measured 3.1–3.4% for the dashboard after the native sampler, which is fine to leave running. Installable packages matter more now |
| 2026-09-29 | Other users' processes on macOS refresh every 5 s (a trimmed `ps`); your own processes refresh every second, natively | macOS only exposes CPU/memory of other users' processes to root (`ps` is setuid) |
