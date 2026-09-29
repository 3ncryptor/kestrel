#!/bin/sh
# Rehearses the npm release against a throwaway local registry (Verdaccio, no uplinks), so nothing
# reaches npmjs.com: publishes the tarballs with scripts/npm-publish.sh (twice, the second run must
# skip everything), installs kestrel-tui globally from that registry into a temporary prefix, and
# runs the installed `kestrel`. The release workflow runs it on Linux and macOS before publishing.
#
#   sh scripts/npm-rehearse.sh <dir with the npm pack tarballs>
#
# Needs Node and npm; your ~/.npmrc is not used or changed.
set -eu

VERDACCIO=verdaccio@6.10.4
PORT=${KESTREL_REHEARSE_PORT:-4873}
REGISTRY="http://127.0.0.1:$PORT/"

dir=$(cd "${1:?usage: sh scripts/npm-rehearse.sh <dir with the npm pack tarballs>}" && pwd)
version=$(node -p 'require("./package.json").version')
work=$(mktemp -d)
server=''
cleanup() {
    if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; fi
    rm -rf "$work"
}
trap cleanup EXIT INT TERM

cat > "$work/config.yaml" <<EOF
storage: $work/storage
max_body_size: 200mb
auth:
  htpasswd:
    file: $work/htpasswd
packages:
  '**':
    access: \$all
    publish: \$authenticated
log: { type: stdout, format: pretty, level: warn }
EOF

npx --yes "$VERDACCIO" --config "$work/config.yaml" --listen "127.0.0.1:$PORT" > "$work/verdaccio.log" 2>&1 &
server=$!
tries=0
until curl -fsS "${REGISTRY}-/ping" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 120 ] || ! kill -0 "$server" 2>/dev/null; then
        cat "$work/verdaccio.log" >&2
        echo "npm-rehearse: the local registry did not start" >&2
        exit 1
    fi
    sleep 0.5
done

# A throwaway user on the throwaway registry, and an npm config that only knows about it.
token=$(curl -fsS -X PUT -H 'content-type: application/json' \
    -d '{"name":"rehearsal","password":"rehearsal-only"}' \
    "${REGISTRY}-/user/org.couchdb.user:rehearsal" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).token))')
NPM_CONFIG_USERCONFIG="$work/npmrc"
printf 'registry=%s\n//127.0.0.1:%s/:_authToken=%s\n' "$REGISTRY" "$PORT" "$token" > "$NPM_CONFIG_USERCONFIG"
NPM_CONFIG_PREFIX="$work/global"
export NPM_CONFIG_USERCONFIG NPM_CONFIG_PREFIX
unset NPM_CONFIG_PROVENANCE

echo "--- publish"
sh scripts/npm-publish.sh "$dir"
echo "--- publish again (everything must be skipped)"
again=$(sh scripts/npm-publish.sh "$dir")
echo "$again"
if [ "$(echo "$again" | grep -c 'already published')" -ne 5 ]; then
    echo "npm-rehearse: the second publish was not a no-op" >&2
    exit 1
fi

echo "--- npm install -g kestrel-tui@$version"
npm install -g "kestrel-tui@$version" --no-fund --no-audit
kestrel="$NPM_CONFIG_PREFIX/bin/kestrel"
reported=$("$kestrel" --version)
if [ "$reported" != "kestrel $version" ]; then
    echo "npm-rehearse: the installed kestrel reports \"$reported\", expected \"kestrel $version\"" >&2
    exit 1
fi
echo "npm-rehearse: $kestrel --version → $reported"
if [ "${KESTREL_REHEARSE_SNAPSHOT:-1}" = 1 ]; then
    "$kestrel" sm --dump --ticks 1 | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const n=JSON.parse(s).processCount;if(!n)process.exit(1);console.log("npm-rehearse: kestrel sm --dump sampled "+n+" processes")})'
fi
echo "npm-rehearse: ok"
