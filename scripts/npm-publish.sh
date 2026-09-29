#!/bin/sh
# Publishes the npm tarballs of a release (RELEASING.md): the four platform packages first, then the
# kestrel-tui launcher, so the launcher never points at a version that is not there yet.
#
#   sh scripts/npm-publish.sh <dir with the npm pack tarballs>
#
# Idempotent: a version already on the registry is skipped, so a release that failed halfway can be
# re-run. The registry, credentials and provenance come from the npm config and environment (the
# release workflow sets NPM_CONFIG_PROVENANCE=true; the rehearsal points it at a local registry).
set -eu

dir=${1:?usage: sh scripts/npm-publish.sh <dir with the npm pack tarballs>}
version=$(node -p 'require("./package.json").version')

for pkg in kestrel-tui-darwin-arm64 kestrel-tui-darwin-x64 kestrel-tui-linux-x64 kestrel-tui-linux-arm64 kestrel-tui; do
    tarball="$dir/$pkg-$version.tgz"
    if [ ! -f "$tarball" ]; then
        echo "npm-publish: $tarball is missing" >&2
        exit 1
    fi
    if npm view "$pkg@$version" version >/dev/null 2>&1; then
        echo "npm-publish: $pkg@$version is already published, skipping"
        continue
    fi
    npm publish "$tarball" --access public
    echo "npm-publish: published $pkg@$version"
done
