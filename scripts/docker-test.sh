#!/bin/sh
# Runs the core test suite and a headless snapshot inside Linux containers, so the Linux adapter is
# exercised on a Mac. The core has no runtime dependencies, so no `bun install` is needed inside.
#
#   scripts/docker-test.sh                      # default images
#   KESTREL_TEST_IMAGES="ubuntu:24.04" scripts/docker-test.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IMAGES=${KESTREL_TEST_IMAGES:-"node:20-bookworm amazonlinux:2023"}

# Installs Node when the image lacks it (Amazon Linux), then runs tests and a 3-tick snapshot.
# The body runs inside the container, so its $variables must not expand here.
# shellcheck disable=SC2016
INNER='
set -e
if ! command -v node >/dev/null 2>&1; then
  dnf install -y -q nodejs20 >/dev/null && ln -sf "$(command -v node-20)" /usr/local/bin/node
fi
echo "node $(node --version) on $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "ss: $(command -v ss || echo missing, /proc/net/tcp fallback will be used)"
node --test --test-timeout=20000 tests/unit/*.test.js tests/integration/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"
node cli/index.js sm --dump --ticks 3 --interval 500 | tail -1 | node -e "
  let d = \"\"; process.stdin.on(\"data\", (c) => (d += c)).on(\"end\", () => {
    const s = JSON.parse(d);
    const ok = s.meta.platform === \"linux\" && typeof s.system.cpuPercent === \"number\" && s.processCount > 0;
    console.log(\"snapshot:\", JSON.stringify({ platform: s.meta.platform, cpu: s.system.cpuPercent, cores: s.system.cores.length,
      memUsedMB: s.system.memUsedMB, memTotalMB: s.system.memTotalMB, processes: s.processCount,
      ports: s.ports.items.length, errors: s.errors }));
    process.exit(ok ? 0 : 1);
  });"
'

status=0
for image in $IMAGES; do
  echo "== $image =="
  if ! docker run --rm -v "$ROOT":/kestrel:ro -w /kestrel "$image" sh -c "$INNER"; then
    echo "FAILED on $image"
    status=1
  fi
done
exit $status
