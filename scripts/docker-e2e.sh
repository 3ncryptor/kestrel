#!/bin/sh
# Runs scripts/e2e/pm-e2e.sh inside Linux containers: the interactive UI (Bun + OpenTUI's Linux build)
# and the process manager in a real PTY. Installs bun and the dependencies inside, so it needs network.
#
#   scripts/docker-e2e.sh
#   KESTREL_TEST_IMAGES="ubuntu:24.04" scripts/docker-e2e.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IMAGES=${KESTREL_TEST_IMAGES:-"node:20-bookworm amazonlinux:2023"}
BUN_VERSION=${BUN_VERSION:-1.4.0}

# The body runs inside the container, so its $variables must not expand here.
# shellcheck disable=SC2016
INNER='
set -e
if ! command -v node >/dev/null 2>&1; then
  dnf install -y -q nodejs20 nodejs20-npm python3 procps-ng tar >/dev/null
  ln -sf "$(command -v node-20)" /usr/local/bin/node
  ln -sf "$(command -v npm-20)" /usr/local/bin/npm
fi
npm install -g --silent "bun@$BUN_VERSION" >/dev/null
mkdir -p /tmp/k
(cd /kestrel && tar --exclude=node_modules --exclude=.kestrel -cf - .) | (cd /tmp/k && tar -xf -)
cd /tmp/k && bun install --frozen-lockfile >/dev/null
echo "bun $(bun --version), node $(node --version) on $(. /etc/os-release && echo "$PRETTY_NAME")"
sh scripts/e2e/pm-e2e.sh
'

status=0
for image in $IMAGES; do
  echo "== $image =="
  if ! docker run --rm -e BUN_VERSION="$BUN_VERSION" -v "$ROOT":/kestrel:ro "$image" sh -c "$INNER"; then
    echo "FAILED on $image"
    status=1
  fi
done
exit $status
