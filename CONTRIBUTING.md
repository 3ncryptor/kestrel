# Contributing to Kestrel

Thanks for helping. Kestrel is a terminal system monitor and process manager for macOS and Linux.
This guide covers what you need to work on it and what a change needs before it can be merged.

## Ground rules

- Be kind: this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.
- For anything larger than a bug fix, open an issue first so we can agree on the approach. The design
  documents ([PRD](docs/PRD.md), [BUILD_PLAN](docs/BUILD_PLAN.md), [UI_SPEC](docs/UI_SPEC.md)) describe
  how the product is meant to behave. A change that disagrees with them should update them too.

## Setup

| Tool | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | 1.4 (`packageManager` in package.json) | Runs the UI, the Bun test suites and the binary build |
| Node.js | ≥ 20 | The core must also run under Node; the main test suite uses `node:test` |
| Python 3 | any | Only for the real-terminal end-to-end check |
| Docker | any | Only for testing Linux from a Mac |

```sh
git clone https://github.com/3ncryptor/kestrel.git && cd kestrel
bun install
npm start            # the dashboard (production React)
npm start -- pm --config tests/fixtures/stack/kestrel.json   # the demo stack
```

[docs/DEV.md](docs/DEV.md) lists every command, the Linux-on-a-Mac loop and how performance is measured.

## Before you open a pull request

```sh
npm run lint          # Biome (lint only)
npm run typecheck     # tsc over the JSDoc types in core/ and cli/
npm test              # core + CLI under Node
npm run test:bun      # the same under Bun (on macOS this includes the native sampler checks)
npm run test:ui       # UI frame tests
sh scripts/e2e/pm-e2e.sh   # optional locally, required in CI: kestrel pm in a real terminal
```

CI runs all of this on macOS and Linux, plus Debian and Amazon Linux containers and a build of every
binary target.

## How the code is organised

- `core/` is the engine (platform adapters, sampler, store, process manager, stack, config) and has no
  UI dependencies. The only way in is `createKestrel()` → `{ store, actions }`.
- `cli/` handles argument parsing and commands. `ui/` is the OpenTUI/React interface; it talks only to
  `store` and `actions`.
- `packaging/` and `scripts/` hold the installer, the npm launcher, builds, benchmarks and end-to-end
  tools.

## Rules the code follows

- **Tests first.** Parsers are tested against captured fixture output, so tests don't depend on the
  machine. Process behaviour is tested with real child processes (`scripts/fixture-server.js`).
- **The store and actions contract is frozen** (`core/store/types.js`, checked by
  `tests/unit/contract.test.js`). To change it, update BUILD_PLAN §6, the types and the contract test
  together.
- **Every action returns `{ ok, data, error, code }` and never throws.** Destructive actions go through
  the safety policy in the core, not only the UI.
- **Kestrel's own OS calls never use a shell** (`execFile` with argument arrays). Only commands from
  the user's stack config run through a shell.
- **Child output is untrusted:** the UI strips escape sequences before drawing it.
- **State updates are immutable.** Local, private buffers in hot paths are the documented exception.
- Files stay under 400 lines and functions under 50. Comments explain *why*, not what.
- **Performance is measured, not assumed.** Include before/after numbers from `scripts/bench.js`
  (engine, children included) or `scripts/bench-ui.jsx` (UI per frame) for anything on a hot path.
- The macOS native sampler (`core/platform/darwinFfi.js`) takes struct layouts from the SDK. After an
  SDK change, regenerate them with `scripts/darwin-offsets.c` rather than editing offsets by hand.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat(cli): …`, `fix(darwin): …`, `perf(linux): …`, `docs: …`, `test: …`, `ci: …`, `chore: …`.
  The body says *why*, and gives numbers for performance changes.
- Keep commits small and self-contained; each should pass the test suites on its own.
- Pull requests use the template: what changed, how it was tested, and whether docs or the contract
  changed.

## Licence

By contributing you agree that your contributions are licensed under the [MIT licence](LICENSE).
