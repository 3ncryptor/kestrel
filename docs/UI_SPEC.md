# Kestrel — UI & Interaction Spec

| | |
|---|---|
| **Version** | 2.0: the btop-style dashboard (v1.0, with its Overview screen, was replaced after the M2 review) |
| **Last updated** | 2026-09-29 |
| **Implements** | [PRD.md](PRD.md) §5.3 and §6 · built in milestones M2 and M3 of [BUILD_PLAN.md](BUILD_PLAN.md) |

---

## 1. Design goals

1. **Familiar to developers.** It looks and works like the tools they already use: **btop's boxed panels** with titles in the border, braille history graphs, and gradient meters, plus htop's dense process table and key conventions. `kestrel` opens straight into the dashboard; there's no separate home screen.
2. **Real graphs, real meters, real color.** Every figure that has a range gets a meter or a graph, and those are always colored along a gradient. (The M2 review found the v1 "color only when something is wrong" approach flat and hard to read.)
3. **Still meaningful.** Color always means something (load level, focus, managed, series), and every status also has a glyph. Nothing is decoration only.
4. **Planned.** Every box, state, key, and color is specified here before it's built.

## 2. Principles → rules

| Principle | Rule in Kestrel |
|---|---|
| **Jakob's law** (users expect your product to work like the ones they know) | A btop layout (cpu across the top; mem and ports on the left; proc on the right), htop/vim/less keys, and `/` to filter |
| **Pre-attentive processing** | Load is shown as color and length at once (gradient meters), so hot spots are visible before any number is read |
| **Gestalt: common region** | Each subsystem lives in its own titled box, and related numbers stay inside it |
| **Hick's law** | The focused box shows **at most five** keys in its bottom border. `?` shows everything |
| **Recognition over recall** | Sort, filter, view, and counts are always visible in the proc box title |
| **Stable spatial memory** | Boxes never move. Row order is stable between refreshes, and the selection persists |
| **Error tolerance** | Destructive actions are tiered (§6.4). Nothing irreversible happens on a single key |

## 3. Design tokens

### 3.1 Palette (soft pastel accents on black)

The background and surfaces are **neutral** (black and greys, chosen at the M2b review). Only the accents are
colored. **Components never use hex values directly; they use semantic tokens.** Switching to a more saturated
theme is a one-file change (`ui/theme/tokens.js`).

| Token | Hex | 256-color | Use |
|---|---|---|---|
| `base` | `#000000` | 16 | App background: pure black (truecolor only) |
| `mantle` | `#121212` | 233 | Dialog backgrounds |
| `surface0` | `#262626` | 235 | Selected row background |
| `surface1` | `#3a3a3a` | 237 | Box borders (unfocused), empty meter cells |
| `overlay0` | `#6c7086` | 243 | Muted text: labels, units, hints |
| `subtext` | `#a6adc8` | 146 | Secondary text |
| `text` | `#cdd6f4` | 189 | Primary text |
| `green` | `#a6e3a1` | 151 | Gradient low, ok |
| `yellow` | `#f9e2af` | 223 | Gradient mid, warn |
| `peach` | `#fab387` | 216 | Gradient high, restarting |
| `red` | `#f38ba8` | 211 | Gradient max, danger |
| `mauve` | `#cba6f7` | 183 | Focus, proc box title |
| `blue` | `#89b4fa` | 111 | cpu box title and graph, info |
| `lavender` | `#b4befe` | 147 | mem box title |
| `teal` | `#94e2d5` | 116 | ports box title, `◆managed` badge |

The 256-color column is what the terminal receives. OpenTUI downsamples truecolor by itself when
`COLORTERM` is absent and `TERM` says 256color (verified in M2: red → 211).

### 3.2 The gradient (UI_SPEC's core color rule)

A value from 0–100% maps to **green → yellow → peach → red**: under 25% green, 25–50% yellow, 50–75%
peach, 75% and above red. Meters color **each filled cell by that cell's own position**, so a 90% meter
shows every color in order, just as btop does. The gradient applies to:

- the CPU graph (each column colored by that sample's value),
- per-core meters, memory meters, and the inline per-process CPU meter,
- the CPU% and memory figures in the process table (memory uses the thresholds in `settings.thresholds`: under warn it's green, from warn yellow, from danger red).

Box **titles** carry the box's accent color (§3.1). **Borders** stay `surface1`, except the focused box, which is `mauve`.

### 3.3 Color-depth fallbacks

| Terminal | Behavior |
|---|---|
| Truecolor (`COLORTERM=truecolor\|24bit`) | Full palette, with the app background painted |
| 256 colors (`TERM` contains `256color`) | OpenTUI downsamples. The app background is **not** painted |
| 16 colors / others | Best effort: OpenTUI still emits truecolor, which almost every modern terminal renders |
| No color (`NO_COLOR`, `--no-color`, `TERM=dumb`) | Kestrel resolves every token to "no color" (OpenTUI ignores `NO_COLOR`). Meaning is carried by dim, bold, underline, reverse video, and glyphs. **Graphs switch to block characters** (`▁▂▃▄▅▆▇█`) so they stay readable |

### 3.4 Status glyphs (color is never the only signal)

| Status | Glyph | Token |
|---|---|---|
| running | `●` | state.ok |
| starting | `◌` | state.warn |
| unready | `◍` | state.warn |
| restarting | `↻` | state.transient |
| errored / crashed | `✕` | state.danger |
| blocked | `⊘` | state.inactive |
| idle / stopped / exited | `○` | state.inactive |
| Managed badge | `◆name` | accent.managed |
| Alert | `▲` warn / `■` danger | state.* |

## 4. Layout

### 4.1 Boxes (standard, 100–139 columns)

```
╭─ cpu ──────────────────────────────────────────── load 1.2 1.4 1.1 · up 3d 4h ─ 1.0s ─╮
│⣀⣠⣤⣶⣿⣷⣦⣤⣀⣀⣠⣴⣾⣿⣷⣶⣤⣀⣀⣠⣤⣶⣿⣷⣦⣤⣀⣀⣠⣴⣾⣿⣷⣶⣤⣀   C0 ■■■■■■──── 58%   C4 ■■──────── 12% │
│⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿   C1 ■■──────── 21%   C5 ■───────── 4% │
│ CPU 42%                                        C2 ■■■■■■■■■─ 91%   …               │
╰───────────────────────────────────────────────────────────────────────────────────────╯
╭─ mem ─────────────────────╮╭─ proc ─────────── filter: node × ── sort: cpu ↓ ── 12/598 ─╮
│ Used  ■■■■■■■■──── 8.2 G  ││   PID Program            User      Cpu%        Mem  State  │
│ Cache ■■■────────── 3.1 G  ││▶  812 node ◆api          aryan     12.1 ■■──  412 M  running│
│ Free  ■■──────────  4.7 G  ││   401 Chrome Helper      aryan      8.4 ■───  1.2 G  sleeping│
│ Swap  ────────────  0.0 B  ││    99 WindowServer       _ws        5.2 ■───  180 M  running│
╰────────────────────────────╯│   …                                                       │
╭─ ports ────────── 14 ─────╮│                                                           │
│ :3000 node ◆api  127.0.0.1 ││                                                           │
│ :5432 postgres   *         ││                                                           │
╰────────────────────────────╯╰─ ↑↓ select ─ / filter ─ s sort ─ x kill ─ ⏎ info ─────────╯
```

| Box | Content |
|---|---|
| **cpu** (full width) | A braille graph of total CPU over the last 4 minutes (240 samples, 2 per character), per-core meters in columns on the right, `CPU nn%` under the graph. The title's right side shows load, uptime and the refresh interval |
| **mem** (left) | Meters for Used, Cache, Free and Swap, each with its size |
| **ports** (left, below mem) | TCP listeners: `:port name ◆managed address`. The title shows the count. It notes when owners are partial (not root) |
| **proc** (right, the rest of the height) | The process table or tree. The title shows filter, sort and the visible/total count |
| **managed** (M3, left column between mem and ports) | The stack, one line per process (§6.5). It grows with the stack, up to half the left column, and ports always keeps 3 rows. `kestrel pm` opens with it focused; `kestrel sm` has no managed box |

**Key hints sit in the focused box's bottom border** (btop style): at most five, generated from the keymap,
keeping only whole hints that fit. Toasts appear in the right part of the big panel's bottom border and win
over hints when space is short. More cores than meter slots end in `+N more`.

**While the managed box has focus, the big panel shows logs** (§6.7) instead of the process table; `Tab`
on to ports (or `Esc`) brings the table back:

```
╭─ mem ──────────────────────╮╭─ logs · api ─────────── following ● ─ 1,932 lines ─╮
│ Used ■■■■■■■■──── 8.2 GB   ││ 14:02:11  GET /health 200 3ms                      │
╰────────────────────────────╯│ 14:02:12  GET /users 200 18ms                      │
╭─ managed · myapp ─── 3/4 ──╮│▎14:02:12  (node) DeprecationWarning: …              │
│▌● api     ready :3000  12% ││ 14:02:15  POST /login 401 9ms                      │
│ ● web     ready :5173   4% ││ 14:02:16  [kestrel] crashed (code 1)               │
│ ↻ worker  retry 3 in 4s    ││                                                    │
│ ⊘ cron    blocked by db    ││                                                    │
╰─ s start ─ x stop ─ r restart ╯╰─ f follow ─ / search ─ v all / one ─ PgUp older ╯
```

### 4.2 Breakpoints

| Width | Changes |
|---|---|
| < 60 cols or < 16 rows | A centered message: `Kestrel needs 60×16 — currently 52×14` |
| 60–99 (compact) | cpu box 5 rows high with short (4-cell) core meters in up to 3 columns, so an 8-core machine shows every core; the left column is 26 wide; proc hides User and State |
| 100–139 (standard) | As §4.1 |
| ≥ 140 (wide) | Up to 3 core-meter columns; proc adds Command |

## 5. Navigation and keys

- There's one screen, the **dashboard**. `kestrel pm` opens it with the managed box focused and the stack
  starting; plain `kestrel` shows the stack `idle` (nothing runs until you press `a` or `s`).
- **`Tab`** moves focus proc → managed → ports. Keys act on the focused box.
- `kestrel sm` is the same dashboard without the managed box (Tab: proc → ports).

| Context | Border keys (≤ 5) | More (help only) |
|---|---|---|
| proc · table | `↑↓ select` `/ filter` `s sort` `x kill` `⏎ info` | `S` reverse, `X` SIGKILL, `r` renice, `t` tree, `c` more cores, `PgUp/PgDn/Home/End`, `⇥` next box |
| proc · tree | `↑↓ select` `←→ fold` `/ filter` `x kill` `t flat` | as table |
| ports | `x kill owner` `⏎ jump` `↑↓ select` `/ filter` `⇥ next box`: the box is narrow, so the border shows as many as fit, most useful first | — |
| managed (its own border) | `s start` `x stop` `r restart` `a start all` | `↑↓` select, `X` stop all, `⏎` show in proc (or pick scripts), `n` new process, `e` env, `w` save to kestrel.json |
| managed (logs panel border) | `f follow` `/ search` `v all / one` `PgUp older` `PgDn newer` | `g`/`Home` oldest, `G`/`End` newest |
| detail drawer | `x kill` `r renice` `Esc close` | — |
| Everywhere | — | `?` help, `q`/`Ctrl+C` quit (asks first while processes run, S12), `Esc` back/close, `L` logs of the failed process (not in `sm`) |

Arrows and `j`/`k` both move the selection, which is why kill is `x`, not `k`.

## 6. Panels in detail

### 6.1 Process table
- Columns: `PID` (muted, right-aligned) · `Program` (with `◆managed` badge; the badge takes at most half the column) · `User` · `Cpu%` (gradient) + a 4-cell inline meter · `Mem` (gradient by memory thresholds) · `State` · `Command` (wide only, paths cut in the middle).
- The selected row gets a `surface0` background and a `▌` bar in mauve. Without color: reverse video.
- **Tree** (`t`): `├─` `└─` `│` guides in muted text; `▾` expanded, `▸` folded (`←→`).
- Empty filter result (S6): `No processes match "nodee" · Esc to clear`.

### 6.2 Detail drawer (`⏎`)
Opens at 40% width on the right of the proc box, showing name, pid/user/state, command, parent chain
(`launchd › Terminal › zsh › node`), running time and nice value.

### 6.3 Ports
`⏎` jumps to the owning process in proc (the filter is cleared). `x` kills the owner through the safety
dialogs. **The confirmation carries the pid shown**, and the core refuses if the port changed owner in the
meantime. When not root: `ℹ your processes only · sudo for all`.

### 6.4 Safety dialogs (tiers from BUILD_PLAN §8.6)

| Tier | Dialog |
|---|---|
| own | `Stop process?` · name · pid · user · `y stop  Esc cancel` |
| system | `Kill a system process` · warning · **type the exact name** · `⏎ kill` only once it matches |
| managed | `api is managed by Kestrel` · auto-restart warning · `m stop via manager` (a clean stop, no restart) · `y kill anyway` |
| blocked | `Can't do that` · reason · `Esc ok` (no confirm option) |
| renice | `Change priority` · prefilled with the current nice value · range -20…20 checked |

Dialogs float in the center with a `mantle` background. The border is red for kill dialogs and mauve for
the others. `Esc` always cancels.

### 6.5 Managed box
- One line per process: selection bar, status glyph (§3.4), name, what the status means, and CPU for a live
  process: `ready :3000` (the port, or an http check's port), `ready` (log check), `up 2m 5s` (no check),
  `starting 4s`, `not ready :3000`, `retry 3 in 4s`, `crashed (exit 1)`, `errored (exit 2)`,
  `blocked by db, cache`, `stopping…`, `stopped`, `exited (exit 0)`, `idle`. Errors are red, `unready` and
  `blocked` yellow, `restarting` peach; the rest is secondary text.
- The title shows `managed · <stack folder>` and the running count (`3/4`).
- Empty states: no stack (S2) → `No stack here` · `kestrel init · n add a process`. Invalid config (S3) →
  `✕ config has N problems` and the first problems with their paths (`kestrel pm` prints all of them and
  exits 2). A fresh package.json project → `package.json: N scripts` · `⏎ pick the ones to run`.

### 6.6 Stack dialogs

| Dialog | Content |
|---|---|
| Quit (S12) | `Stop N running processes and quit?` · `y stop and quit  Esc cancel`; then `Stopping the stack` lists each process (`◌ stopping…` → `✓ stopped`) in stop order until Kestrel exits. Quitting with nothing running doesn't ask |
| Left running (S13) | Shown first on start when a previous Kestrel was killed hard: `N processes from a previous Kestrel are still running`, each with its pid · `s stop them  Esc leave them running`. The stack waits for the answer |
| New process (`n`) | `name: command`, or just a command (the name is derived) · `⏎ start`. `w` later saves it to kestrel.json |
| Environment (`e`) | The variables the stack adds (envFile + inline), values masked `••••••••` until `r` |
| Script picker | package.json scripts with checkboxes, long-running ones (`dev`, `start`, `watch`…) preselected · `␣ toggle  ⏎ start  w start + save`. Opens by itself in `kestrel pm` |

### 6.7 Logs panel
- The selected process's output, newest at the bottom: `HH:MM:SS text`. A peach `▎` marks stderr; Kestrel's
  own lines (`[kestrel] …`) are muted. `v` interleaves every process by time with a name column.
- **Following** (`following ●`) shows the newest lines. `PgUp`/`g` pause it: the view stays put while new
  lines arrive and the title counts them (`paused · 12 new`). `PgDn` past the newest line, `G` or `f`
  follow again. Selecting another process follows its output.
- **Search** (`/`): substring or `/regex/`, case-insensitive. The title shows `/query` and the match count,
  and matches are highlighted in mauve. `⏎` keeps the search, and `Esc` clears it (a second `Esc` goes back
  to proc). An invalid pattern shows its error instead of lines.
- Output is shown as plain text: color codes and terminal control sequences are removed, so a child can't
  move the cursor, retitle the terminal or break the layout. Saved log files keep the original bytes.

## 7. States (each has a UI test)

| # | State | Presentation |
|---|---|---|
| S1 | First sample pending | Figures show `—`, graphs are empty, and the cpu title says `sampling…` |
| S4 | A data source failed | A warn line at the top: `ports unavailable · ss not found · run kestrel doctor`. Other boxes keep working |
| S5 | Ports partial | Info line in the ports box |
| S6 | Filter has no matches | Message in the proc box |
| S9 | Terminal too small | Centered size message |
| S10/S11 | Action failed / succeeded | A toast in the proc border (danger 6 s / muted 3 s) |
| S14 | No color | Attributes, glyphs and block-character graphs only |
| S2 | No stack here | Managed box empty state (§6.5) |
| S3 | Invalid config | Managed box lists the problems; `kestrel pm` prints them and exits 2 |
| S7 | A managed process restarting | `↻ retry 3 in 4s` in the managed box |
| S8 | A process gave up (`maxRestarts`) | Danger line at the top: `api stopped after 11 crashes (last exit 1) · see its logs · L show logs` |
| S12 | Quit with processes running | Quit dialog, then the stop progress (§6.6) |
| S13 | Processes left by a previous session | The left-running dialog (§6.6) |

## 8. Motion and refresh
Values update in place once per tick. Nothing flashes or blinks, and nothing animates: a starting process
shows `◌ starting 4s`, counting up each tick. The several store commits of one tick are coalesced into a
single render. New log lines reach the screen within 250 ms, in batches.

## 9. Formatting rules

| Value | Rule | Examples |
|---|---|---|
| CPU % | 1 decimal place, right-aligned | `  3.1` ` 58.4` |
| Memory | Under 1024 MB → integer MB, otherwise 1 decimal in GB | `90 MB` `1.2 GB` |
| Durations | The two largest units | `45s` `12m 3s` `3h 4m` `3d 4h` |
| Unknown | Em dash, muted | `—` |
| Truncation | Names cut at the end, paths in the middle | `Chrome Helper (Rend…` `~/code/…/server` |

## 10. Accessibility
Glyph + label on every status. Text contrast of at least 4.5:1 against `base` (tested). `NO_COLOR` is
respected. Everything works from the keyboard. Nothing blinks.

## 11. Review checklist (every UI change)
- [ ] Semantic tokens only, with no hex values in components.
- [ ] Every ranged figure has a gradient meter or graph.
- [ ] The focused box shows 5 or fewer border keys, taken from `keymap.js`.
- [ ] Row order and selection stay stable across refreshes.
- [ ] Compact, standard and wide are checked, plus the too-small state and no-color.
- [ ] Destructive actions go through the matching safety dialog tier.
