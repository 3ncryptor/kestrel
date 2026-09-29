#!/bin/sh
# Refreshes tests/fixtures/linux/captured/ with real kernel output from a throwaway container,
# so the Linux parsers are also tested against genuine formats (not only hand-written ones).
# The container starts a listener first, so /proc/net/tcp and `ss` have something to report.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/tests/fixtures/linux/captured"
IMAGE=${KESTREL_CAPTURE_IMAGE:-node:20-bookworm}
mkdir -p "$OUT"

docker run --rm -v "$OUT":/out "$IMAGE" sh -c '
set -e
node -e "require(\"net\").createServer().listen(5432, \"127.0.0.1\"); setInterval(() => {}, 1000)" &
LISTENER=$!
sleep 1
cat /proc/meminfo > /out/meminfo.txt
cat /proc/stat > /out/proc_stat.txt
cat /proc/$LISTENER/stat > /out/pid_stat.txt
cat /proc/$LISTENER/status > /out/pid_status.txt
tr "\0" "\n" < /proc/$LISTENER/cmdline > /out/pid_cmdline.txt
cat /proc/net/tcp > /out/net_tcp.txt
cat /proc/net/tcp6 > /out/net_tcp6.txt
if command -v ss >/dev/null 2>&1; then ss -ltnpH > /out/ss.txt; else echo "# ss not available in this image" > /out/ss.txt; fi
echo "$LISTENER" > /out/listener_pid.txt
kill $LISTENER
'
echo "captured into $OUT:"
ls -1 "$OUT"
