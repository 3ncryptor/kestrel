# Changelog

All notable changes to Kestrel are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-09-29

### Fixed

- **npm package pages.** Every package now has a README written for npm: `kestrel-tui` covers install,
  commands, keys, stacks, verification and troubleshooting, and each `kestrel-tui-<os>-<arch>` package
  explains what it is and that `kestrel-tui` installs it. In 0.1.0 the platform packages had no README
  and `kestrel-tui` showed the pre-release repository README.
- `kestrel --help` links to the documentation online instead of `docs/` paths that only exist in a
  source checkout.

## [0.1.0] - 2026-09-29

The first preview release, for macOS and Linux on arm64 and x64.

### Added

- **Dashboard** (`kestrel`, `kestrel sm`): a btop-style view with a braille CPU graph and per-core
  gradient meters, memory and swap meters, listening TCP ports, and a process table and tree with
  filter, sort, a details drawer, kill and renice.
- **Process manager** (`kestrel pm`):
  - Starts a stack from `kestrel.json`, a Procfile or package.json scripts, in dependency order.
  - Readiness checks (port, HTTP, log line) and restart policies with backoff and `maxRestarts`.
  - Env files, saved and rotated logs, a searchable live logs panel, and ad-hoc processes.
  - Resource use summed per process tree, and a memory-leak hint.
- **Safety:** tiered confirmations for kill and renice (own, managed, other users' and system
  processes; Kestrel itself and PID 1 are blocked), enforced in the core.
- **Crash recovery:** after a hard kill, the next start finds the processes left running (verified by
  start time) and offers to stop them before starting the stack again.
- **Commands:** `kestrel init` (writes `kestrel.json` from what the project has), `kestrel import pm2`,
  `kestrel doctor` (checks the machine, terminal and config) and `kestrel update` (checksum-verified
  self-update for standalone installs).
- **Native macOS sampling** through Bun's FFI (libproc and Mach), and a `/proc` sampler on Linux that
  reads one file per process per tick.
- **Install:** `npm install -g kestrel-tui` (a launcher plus one standalone binary per platform, no
  install scripts, published with npm provenance), a checksum-verifying `curl | sh` installer, and
  release archives with `SHA256SUMS` and GitHub build attestations.

[Unreleased]: https://github.com/3ncryptor/kestrel/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/3ncryptor/kestrel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/3ncryptor/kestrel/releases/tag/v0.1.0
