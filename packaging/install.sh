#!/bin/sh
# Kestrel installer: downloads the standalone binary for this machine from GitHub Releases,
# verifies its SHA-256 checksum and installs it. No sudo needed with the default directory.
#
#   curl -fsSL https://raw.githubusercontent.com/3ncryptor/kestrel/main/packaging/install.sh | sh
#
# Environment:
#   KESTREL_VERSION       version to install, e.g. v0.2.0 (default: the latest release)
#   KESTREL_INSTALL_DIR   where to put `kestrel` (default: ~/.local/bin)
#   KESTREL_DOWNLOAD_BASE download from here instead of GitHub (mirrors, tests)
set -eu

REPO="3ncryptor/kestrel"
INSTALL_DIR="${KESTREL_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
die() { printf 'kestrel installer: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch <url> <file>
    if has curl; then curl --proto '=https,http' --fail --location --silent --show-error --output "$2" "$1"
    elif has wget; then wget --quiet --output-document "$2" "$1"
    else die "curl or wget is required"; fi
}

fetch_stdout() {
    if has curl; then curl --fail --location --silent --show-error "$1"
    elif has wget; then wget --quiet --output-document - "$1"
    else die "curl or wget is required"; fi
}

detect_target() {
    os=$(uname -s)
    arch=$(uname -m)
    case "$os" in
        Darwin) os=darwin ;;
        Linux) os=linux ;;
        *) die "$os is not supported yet (macOS and Linux are): https://github.com/$REPO/issues" ;;
    esac
    case "$arch" in
        arm64 | aarch64) arch=arm64 ;;
        x86_64 | amd64) arch=x64 ;;
        *) die "the $arch architecture is not supported yet (arm64 and x64 are)" ;;
    esac
    # A shell running under Rosetta reports x86_64 on Apple Silicon: install the native build.
    if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
        arch=arm64
    fi
    echo "$os-$arch"
}

latest_version() {
    fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

sha256_of() {
    if has sha256sum; then sha256sum "$1" | cut -d ' ' -f 1
    elif has shasum; then shasum -a 256 "$1" | cut -d ' ' -f 1
    else die "sha256sum or shasum is required to verify the download"; fi
}

main() {
    target=$(detect_target)
    version="${KESTREL_VERSION:-$(latest_version)}"
    [ -n "$version" ] || die "could not find the latest release (set KESTREL_VERSION=v0.1.0 to pick one)"
    version="${version#v}"
    asset="kestrel-v$version-$target.tar.gz"
    base="${KESTREL_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download/v$version}"

    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT INT TERM
    say "Downloading kestrel $version for $target…"
    fetch "$base/$asset" "$tmp/$asset" || die "download failed: $base/$asset"
    fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" || die "download failed: $base/SHA256SUMS"

    expected=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)
    actual=$(sha256_of "$tmp/$asset")
    [ -n "$expected" ] || die "$asset is not listed in SHA256SUMS"
    [ "$expected" = "$actual" ] || die "checksum mismatch for $asset (expected $expected, got $actual); nothing was installed"

    tar -xzf "$tmp/$asset" -C "$tmp"
    mkdir -p "$INSTALL_DIR"
    # Stage next to the destination, then rename: an upgrade never leaves a half-written binary.
    cp "$tmp/kestrel-v$version-$target/kestrel" "$INSTALL_DIR/.kestrel.new"
    chmod 755 "$INSTALL_DIR/.kestrel.new"
    mv "$INSTALL_DIR/.kestrel.new" "$INSTALL_DIR/kestrel"
    say "Installed kestrel $version to $INSTALL_DIR/kestrel"

    case ":$PATH:" in
        *":$INSTALL_DIR:"*) say "Run: kestrel doctor" ;;
        *) say ""
           say "$INSTALL_DIR is not on your PATH. Add it, e.g. for bash or zsh:"
           say "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.profile && . ~/.profile"
           say "Then run: kestrel doctor" ;;
    esac
}

main "$@"
