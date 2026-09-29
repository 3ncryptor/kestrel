#!/bin/sh
# Switches npm publishing from a token to trusted publishing (OIDC), once, after the first release
# (RELEASING.md). npm can only trust a workflow for a package that already exists, which is why the
# very first release publishes with a short-lived token.
#
#   npm login          (the account that owns the packages, with 2FA)
#   sh scripts/npm-trust.sh [--dry-run]
#
# Afterwards only .github/workflows/release.yml, running in the `release` environment of this repo,
# can publish. Then delete the NPM_TOKEN secret and the token itself, and on npmjs.com set each
# package to "Require two-factor authentication and disallow tokens".
set -eu

NPM=npm@11.20.0 # `npm trust` needs npm 11.15 or newer; npx fetches it, your global npm is untouched
REPO=3ncryptor/kestrel
WORKFLOW=release.yml
ENVIRONMENT=release
PACKAGES='kestrel-tui kestrel-tui-darwin-arm64 kestrel-tui-darwin-x64 kestrel-tui-linux-x64 kestrel-tui-linux-arm64'

dry_run=''
case "${1:-}" in
    '') ;;
    --dry-run) dry_run=--dry-run ;;
    *) echo "usage: sh scripts/npm-trust.sh [--dry-run]" >&2; exit 2 ;;
esac

user=$(npx --yes "$NPM" whoami 2>/dev/null) || { echo "npm-trust: log in first: npm login" >&2; exit 1; }
echo "npm-trust: logged in as $user; trusting $REPO → $WORKFLOW (environment $ENVIRONMENT)"

for pkg in $PACKAGES; do
    if ! npx --yes "$NPM" view "$pkg" version >/dev/null 2>&1; then
        echo "npm-trust: $pkg is not on npm yet; publish the first release before running this" >&2
        exit 1
    fi
    # shellcheck disable=SC2086 # $dry_run is empty or one flag
    npx --yes "$NPM" trust github "$pkg" --file "$WORKFLOW" --repo "$REPO" --env "$ENVIRONMENT" --allow-publish --yes $dry_run
done

echo "npm-trust: done. Check with: npx $NPM trust list kestrel-tui"
