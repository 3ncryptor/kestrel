#!/bin/sh
# Sets up a Kestrel development environment in one step: checks the tools, installs what is missing
# (with your permission), installs dependencies (which also installs the husky git hook), links a
# `kestrel` dev command, and verifies that everything works.
#
#   ./setup.sh            interactive: asks before installing or changing anything outside the repo
#   ./setup.sh --yes      accepts every default (CI, scripts)
#   ./setup.sh --check    only reports what is installed; changes nothing
#
# macOS and Linux: full setup. Windows: use WSL2 for the full setup (Kestrel monitors macOS and Linux
# processes, and its process tests need POSIX process groups); in Git Bash this sets up dependencies,
# the hooks, lint and the type check, which is enough to work on docs, the UI and the portable code.
set -eu

cd "$(dirname "$0")"

YES=0
CHECK=0
for arg in "$@"; do
    case "$arg" in
        -y | --yes) YES=1 ;;
        --check) CHECK=1 ;;
        -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
        *) printf 'setup: unknown option %s (try --help)\n' "$arg" >&2; exit 2 ;;
    esac
done

# ---------- output ----------

if [ -t 1 ]; then BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m'); RESET=$(printf '\033[0m'); else BOLD=''; DIM=''; RESET=''; fi
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
fail() { printf '  ✗ %s\n' "$*"; }
step() { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }
note() { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }
has() { command -v "$1" >/dev/null 2>&1; }

# ask "question" → 0 for yes. Defaults to yes; --yes answers yes; no terminal means yes only with --yes.
ask() {
    [ "$YES" = 1 ] && return 0
    [ -t 0 ] || return 1
    printf '    %s [Y/n] ' "$1"
    read -r answer || return 1
    case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# version_ge 1.4.2 1.4.0 → true
version_ge() {
    [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)" = "$2" ]
}

# ---------- platform ----------

detect_platform() {
    case "$(uname -s)" in
        Darwin) echo macos ;;
        Linux)
            if grep -qi microsoft /proc/version 2>/dev/null; then echo wsl; else echo linux; fi ;;
        MINGW* | MSYS* | CYGWIN*) echo gitbash ;;
        *) echo unsupported ;;
    esac
}

PLATFORM=$(detect_platform)
BUN_VERSION=$(sed -n 's/.*"packageManager": *"bun@\([^"]*\)".*/\1/p' package.json)
NODE_MIN=20
PROBLEMS=0

step "Kestrel development setup"
case "$PLATFORM" in
    macos) ok "macOS $(sw_vers -productVersion 2>/dev/null || true) ($(uname -m))" ;;
    linux) ok "Linux $(uname -r) ($(uname -m))" ;;
    wsl) ok "Windows, WSL2 ($(uname -m)): full setup" ;;
    gitbash)
        warn "Windows, Git Bash: dependencies, hooks, lint and type check only"
        note "Kestrel runs on macOS and Linux; for the app and the full test suites use WSL2:"
        note "  wsl --install   then clone the repo inside WSL and run ./setup.sh there" ;;
    *) fail "$(uname -s) is not supported (macOS, Linux and Windows are)"; exit 1 ;;
esac

# ---------- tools ----------

bun_version() { bun --version 2>/dev/null || true; }

install_bun() {
    if [ "$PLATFORM" = gitbash ]; then
        powershell.exe -NoProfile -Command "& ([scriptblock]::Create((irm https://bun.sh/install.ps1))) -Version $BUN_VERSION"
        PATH="$HOME/.bun/bin:$PATH"
    else
        curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
        PATH="$HOME/.bun/bin:$PATH"
    fi
    export PATH
}

check_bun() {
    version=$(bun_version)
    if [ -z "$version" ]; then
        fail "Bun not found (the project uses $BUN_VERSION)"
        [ "$CHECK" = 1 ] && { PROBLEMS=$((PROBLEMS + 1)); return; }
        if ask "Install Bun $BUN_VERSION with its official installer (into ~/.bun)?"; then
            install_bun
            version=$(bun_version)
            if [ -n "$version" ]; then ok "Bun $version installed"; else fail "Bun installation failed"; exit 1; fi
        else
            note "Install it from https://bun.sh, then run ./setup.sh again."
            exit 1
        fi
    elif version_ge "$version" "$BUN_VERSION"; then
        ok "Bun $version"
    else
        warn "Bun $version is older than the project's $BUN_VERSION"
        if [ "$CHECK" = 0 ] && ask "Upgrade Bun?"; then bun upgrade && ok "Bun $(bun_version)"; else note "bun upgrade"; fi
    fi
}

check_node() {
    if ! has node; then
        warn "Node.js not found: the main test suite (npm test) needs Node $NODE_MIN or newer"
        node_hint
        return
    fi
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    if [ "$major" -ge "$NODE_MIN" ]; then ok "Node.js $(node --version)"; else warn "Node.js $(node --version) is older than $NODE_MIN"; node_hint; fi
}

node_hint() {
    case "$PLATFORM" in
        macos) note "brew install node@22   (or use nvm / fnm)" ;;
        gitbash) note "winget install OpenJS.NodeJS.LTS" ;;
        *) note "https://nodejs.org/en/download (or: curl -fsSL https://fnm.vercel.app/install | bash)" ;;
    esac
}

optional_tool() { # name purpose
    if has "$1"; then ok "$1 ($2)"; else note "$1 not found: optional, for $2"; fi
}

step "Tools"
if has git; then ok "git $(git --version | cut -d ' ' -f 3)"; else fail "git is required"; exit 1; fi
check_bun
check_node
if [ "$PLATFORM" != gitbash ]; then
    optional_tool python3 "the real-terminal end-to-end check"
    optional_tool docker "testing Linux from a Mac"
fi
optional_tool shellcheck "linting shell scripts (CI runs it anyway)"

if [ "$CHECK" = 1 ]; then
    step "Check only: nothing was changed"
    if [ "$PROBLEMS" = 0 ]; then exit 0; else exit 1; fi
fi

# ---------- project ----------

step "Dependencies"
bun install --frozen-lockfile
ok "installed from bun.lock"

step "Git hooks"
# husky installs the hook during `bun install` (the package's prepare script).
if [ "$(git config --get core.hooksPath || true)" = ".husky/_" ]; then
    ok "husky pre-commit hook: lint + type check (skip once with git commit --no-verify)"
else
    warn "the husky hook is not active: run bun install inside the git checkout"
fi

if [ "$PLATFORM" != gitbash ]; then
    step "The kestrel command"
    if has kestrel && [ "$(command -v kestrel)" = "$HOME/.bun/bin/kestrel" ]; then
        ok "kestrel points at this checkout"
    elif ask "Link a 'kestrel' command to this checkout (bun link, into ~/.bun/bin)?"; then
        bun link >/dev/null
        ok "kestrel → $(pwd)/cli/index.js"
        case ":$PATH:" in *":$HOME/.bun/bin:"*) ;; *) note "add ~/.bun/bin to your PATH to use it" ;; esac
    else
        note "skipped; use npm run pm / npm run sm, or bun link later"
    fi
fi

# verify "label" "command to rerun" command… : runs it quietly; on failure says how to see why.
# (An explicit if: `set -e` does not stop on a failure on the left of `&&`.)
verify() {
    label=$1; rerun=$2; shift 2
    if "$@" >/dev/null 2>&1; then ok "$label"; else fail "$label failed: run $rerun to see why"; exit 1; fi
}

step "Verify"
verify "lint" "npm run lint" bun run lint
verify "type check" "npm run typecheck" bun run typecheck
if [ "$PLATFORM" = gitbash ]; then
    note "test suites: run them in WSL2 or on macOS/Linux (they use POSIX process groups)"
elif has node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN" ]; then
    printf '    running the test suites (about a minute)…\n'
    verify "core and CLI tests (Node)" "npm test" node --test --test-timeout=20000 tests/unit/*.test.js tests/integration/*.test.js
    verify "UI tests (Bun)" "npm run test:ui" bun test ./tests/ui
else
    note "tests skipped: they need Node $NODE_MIN+"
fi

step "Ready"
cat <<EOF
    npm run dev            the dashboard with React's development build (clear errors)
    npm start              the dashboard, production build
    npm run demo           the process manager on the demo stack (tests/fixtures/stack)
    npm run pm             the process manager for the project in this folder
    npm run sm             the system monitor only
    npm test               tests    ·   npm run lint   ·   npm run typecheck
    CONTRIBUTING.md        how to contribute  ·  docs/DEV.md  every developer command
EOF
