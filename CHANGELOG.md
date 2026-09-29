# Changelog

All notable changes to Kestrel are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing has been released yet; the first release will be 0.1.0.

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
- **Packaging, prepared but not published:** standalone binaries for macOS and Linux (arm64, x64), a
  checksum-verifying `curl | sh` installer, npm launcher and per-platform packages, and a Homebrew
  formula generator.
