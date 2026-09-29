# Releasing Kestrel

Releases are built and published by [`.github/workflows/release.yml`](.github/workflows/release.yml),
never from a laptop. A `v*.*.*` tag on `main` starts it; nothing is published until a maintainer
approves the `release` environment.

| Stage | What it does |
|---|---|
| verify | The tag equals `v` + the `package.json` version, the commit is on `main`, `CHANGELOG.md` has a dated section for the version (it becomes the release notes), and lint, types and every test suite pass |
| build | The standalone binary, compiled and smoke-tested natively on each target: darwin-arm64, darwin-x64, linux-x64, linux-arm64 |
| assemble | `kestrel-v<version>-<os>-<arch>.tar.gz` for each target, `SHA256SUMS`, `install.sh`, and the five npm tarballs (`kestrel-tui` and `kestrel-tui-<os>-<arch>`) |
| rehearse | On all four targets: `install.sh` against a local copy of the release, and [`scripts/npm-rehearse.sh`](scripts/npm-rehearse.sh), which publishes the exact tarballs to a throwaway local registry, installs `kestrel-tui` from it and runs it |
| publish | Waits for approval. Then: build provenance attestations for the archives, a draft GitHub Release with the archives, then npm with provenance ([`scripts/npm-publish.sh`](scripts/npm-publish.sh): platform packages first, then the launcher), and only then the release goes live |
| live | Fresh macOS and Linux runners install the published release with `curl \| sh` and `npm install -g`, and verify the attestation and the npm signatures |

A manual run (Actions → Release → Run workflow) is a **rehearsal**: every stage up to publish, which is
skipped. Run one before tagging.

## One-time setup

1. **npm account** with two-factor authentication on.
2. **`release` environment** (Settings → Environments): required reviewer = the maintainers, deployment
   restricted to tags matching `v*`. Without it, a tag would publish without asking.
3. **Tag ruleset** (Settings → Rules): only maintainers can create, update or delete `v*` tags.
   The `Protect main` and `Require CI on main` rulesets keep a broken or rewritten `main` from being tagged.
4. **First release only, the bootstrap token.** npm can only trust a workflow for a package that exists,
   so the first publish uses a token:
   - npmjs.com → Access Tokens → Generate New Token → *Granular*: expiration **1 day**, packages and
     scopes **Read and write** on all packages, and *Bypass two-factor authentication* ticked (CI cannot
     answer a 2FA prompt).
   - Save it as the `NPM_TOKEN` secret **of the `release` environment** (not a repository secret), so
     only an approved release job can read it.

## Every release

1. On a branch: set the version in `package.json`, and move the `Unreleased` entries of `CHANGELOG.md`
   into `## [x.y.z] - YYYY-MM-DD` (update the links at the bottom). Merge it to `main` with CI green.
2. Rehearse: Actions → Release → Run workflow on `main`. Everything must be green.
3. Tag and push:

   ```sh
   git switch main && git pull
   git tag -a v0.1.0 -m "Kestrel 0.1.0"
   git push origin v0.1.0
   ```

4. When verify, build, assemble and rehearse are green, approve the `release` deployment.
5. Watch the live stage, then check <https://www.npmjs.com/package/kestrel-tui> and the release page.

## After the first release: trusted publishing

Switch npm from the token to OIDC, so no long-lived publishing credential exists anywhere:

```sh
npm login                       # the account that owns the packages
sh scripts/npm-trust.sh --dry-run
sh scripts/npm-trust.sh         # trusts release.yml in the release environment, for all five packages
```

Then:

- delete the `NPM_TOKEN` secret, and revoke the token on npmjs.com;
- on npmjs.com, for each of the five packages: Settings → Publishing access → *Require two-factor
  authentication and disallow tokens*.

The next release publishes through OIDC with no change to the workflow: with the secret gone,
`NODE_AUTH_TOKEN` is empty and npm falls through to trusted publishing. That release is the first real
test of it, so watch its publish job; if npm answers 401/403 there, check `npx npm@11.20.0 trust list
kestrel-tui` (workflow file, repository and environment must match exactly), fix it, and re-run the job.

## When something fails

- **Before publish:** fix it on `main`, delete the tag (`git push origin :refs/tags/v0.1.0`,
  `git tag -d v0.1.0`), and tag again.
- **During publish:** re-run the failed jobs. Every step can run again: the draft release gets its files
  replaced, and npm versions that are already published are skipped. If you give the version up
  instead, delete its draft release (`gh release delete v0.1.0`) so it doesn't linger.
- **After publish:** an npm version can never be reused, even after unpublishing. Fix forward with a
  patch release (`0.1.1`). Don't unpublish unless a release is harmful; npm only allows it within 72 hours.

## Checking a release as a user

```sh
gh attestation verify kestrel-v0.1.0-darwin-arm64.tar.gz --repo 3ncryptor/kestrel
npm audit signatures            # in a project with kestrel-tui installed
```
