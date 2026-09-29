# Security policy

Kestrel can signal processes, runs the commands in a project's config, and replaces its own binary
when updating, so security reports are taken seriously.

## Supported versions

Kestrel is before 1.0. Fixes go into the latest release and `main`; older versions are not patched.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
[Report a vulnerability](https://github.com/3ncryptor/kestrel/security/advisories/new).

Include what you found, how to reproduce it (the Kestrel version and `kestrel doctor` output help),
and what an attacker could achieve. You can expect:

- an acknowledgement within 7 days (Kestrel has a small maintainer team, so this is best effort);
- an assessment and a plan, or questions, after that;
- a fix and a coordinated disclosure, crediting you unless you prefer otherwise.

## What counts

In scope, for example:
- signalling or renicing a process the safety policy should have blocked or required confirmation for;
- child-process output reaching the terminal as control sequences (it must be shown as plain text);
- `kestrel update` or `packaging/install.sh` installing a binary that doesn't match the release checksum;
- stopping a "left-over" process that Kestrel did not start (a reused pid);
- secrets from `.env` files ending up somewhere other than the managed process and its log file.

Working as designed:
- **Commands in `kestrel.json`, a Procfile or package.json run with your privileges** when you start
  the stack. That is the same trust model as `npm run`. Review configs from untrusted repositories
  before running `kestrel pm`. Plain `kestrel` never starts anything on its own, and `kestrel sm` never
  reads the config.
- `kestrel import pm2` executes a `.js` ecosystem file (as pm2 does), but only after you confirm.
- Saved logs contain whatever your processes print. They are owner-only (0600) under `.kestrel/`.

## How updates are verified

`kestrel update` and the installer download over HTTPS from GitHub Releases and check each archive's
SHA-256 against the release's `SHA256SUMS` before installing. The update also runs the new binary once
and checks its version before replacing the old one. Because the checksum file comes from the same
release, this protects against corrupted or tampered downloads in transit. Signed provenance
attestations are planned for authenticating the release itself.
