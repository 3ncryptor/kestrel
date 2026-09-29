#!/bin/sh
# Builds the site's fonts (website/public/fonts/, committed): small WOFF2 subsets. The monospace ones hold
# exactly what the hero dashboard and the code blocks draw — ASCII, box drawing, blocks, braille (the
# CPU graph) and Kestrel's status glyphs; the sans holds Latin text.
#
#   sh website/scripts/subset-fonts.sh
#
#   Kestrel Mono     Cascadia Mono 2407.24 (SIL OFL 1.1), regular and bold. Renamed: "Cascadia Code" is a
#                    Reserved Font Name, which a modified (subset) font may not use.
#   Kestrel Symbols  DejaVu Sans Mono 2.37 (Bitstream Vera licence), only ↻ ⇥ ⊘ ✕ ℹ, which Cascadia
#                    lacks. Renamed, as that licence requires for modified fonts.
#   Plus Jakarta Sans 2.7.1 (SIL OFL 1.1, no Reserved Font Name, so the name stays), the variable font
#                    (weights 200–800 in one file), with its kerning and ligatures.
#
# Downloads are checked against pinned SHA-256 sums; fonttools and brotli run in a throwaway virtualenv.
set -eu

CASCADIA_URL=https://github.com/microsoft/cascadia-code/releases/download/v2407.24/CascadiaCode-2407.24.zip
CASCADIA_SHA256=e67a68ee3386db63f48b9054bd196ea752bc6a4ebb4df35adce6733da50c8474
DEJAVU_URL=https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip
DEJAVU_SHA256=7576310b219e04159d35ff61dd4a4ec4cdba4f35c00e002a136f00e96a908b0a
JAKARTA_URL=https://github.com/tokotype/PlusJakartaSans/releases/download/2.7.1/PlusJakartaSans-2.7.1.zip
JAKARTA_SHA256=4bfc5cdf97d750423bb3d1d40ed8e529bc92288924d9c65e18ff486acefac66c
FONTTOOLS=fonttools==4.66.1
BROTLI=brotli==1.2.0

# ASCII and Latin-1, dashes, quotes, bullets and ellipsis, arrows, ⇥ ⏎, box drawing and blocks,
# geometric shapes (● ○ ◆ ■ ▲ ◌ ◍ ▸ ▾), and all of braille.
MONO_UNICODES=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-2199,U+21E5,U+23CE,U+2500-259F,U+25A0-25FF,U+2800-28FF
SYMBOL_UNICODES=U+21BB,U+21E5,U+2298,U+2715,U+2139
# Latin and Latin-1, dashes, quotes, bullet, ellipsis, arrows, ×, ✓, and the minus sign.
SANS_UNICODES=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-2193,U+00D7,U+2212,U+2713

here=$(cd "$(dirname "$0")" && pwd)
out="$here/../public/fonts"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

fetch() { # url sha256 file
    curl -fsSL -o "$work/$3" "$1"
    actual=$(shasum -a 256 "$work/$3" | cut -d ' ' -f 1)
    if [ "$actual" != "$2" ]; then
        echo "subset-fonts: $3 has SHA-256 $actual, expected $2" >&2
        exit 1
    fi
}

fetch "$CASCADIA_URL" "$CASCADIA_SHA256" cascadia.zip
fetch "$DEJAVU_URL" "$DEJAVU_SHA256" dejavu.zip
fetch "$JAKARTA_URL" "$JAKARTA_SHA256" jakarta.zip
unzip -q "$work/cascadia.zip" -d "$work/cascadia"
unzip -q "$work/dejavu.zip" -d "$work/dejavu"
unzip -q "$work/jakarta.zip" -d "$work/jakarta"

python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet --disable-pip-version-check "$FONTTOOLS" "$BROTLI"
py="$work/venv/bin/python"

# subset <source ttf> <unicodes> <family> <style> <output woff2>
subset() {
    "$work/venv/bin/pyftsubset" "$1" --unicodes="$2" --flavor=woff2 --layout-features='' \
        --no-hinting --desubroutinize --output-file="$work/subset.woff2"
    "$py" - "$work/subset.woff2" "$3" "$4" "$5" <<'EOF'
import sys
from fontTools.ttLib import TTFont
src, family, style, dst = sys.argv[1:]
# No timestamp from the build time, so rebuilding gives byte-identical files.
font = TTFont(src, recalcTimestamp=False)
names = {1: family, 2: style, 4: f"{family} {style}", 6: f"{family.replace(' ', '')}-{style}", 16: family, 17: style}
name = font["name"]
for record in list(name.names):
    if record.nameID in (3, 16, 17, 18, 21, 22, 25):
        name.removeNames(nameID=record.nameID)
for name_id, value in names.items():
    name.setName(value, name_id, 3, 1, 0x409)
    name.setName(value, name_id, 1, 0, 0)
font.save(dst)
EOF
    echo "subset-fonts: $(basename "$5") $(wc -c < "$5" | tr -d ' ') bytes"
}

mkdir -p "$out"
subset "$work/cascadia/ttf/static/CascadiaMono-Regular.ttf" "$MONO_UNICODES" "Kestrel Mono" Regular "$out/kestrel-mono-regular.woff2"
subset "$work/cascadia/ttf/static/CascadiaMono-Bold.ttf" "$MONO_UNICODES" "Kestrel Mono" Bold "$out/kestrel-mono-bold.woff2"
subset "$(find "$work/dejavu" -name DejaVuSansMono.ttf | head -n 1)" "$SYMBOL_UNICODES" "Kestrel Symbols" Regular "$out/kestrel-symbols.woff2"

# The sans keeps its own names and its layout features (kerning, ligatures): it sets running text.
jakarta=$(find "$work/jakarta" -path '*/variable/PlusJakartaSans\[wght\].ttf' -not -path '*__MACOSX*' | head -n 1)
"$work/venv/bin/pyftsubset" "$jakarta" --unicodes="$SANS_UNICODES" --flavor=woff2 --no-hinting \
    --desubroutinize --output-file="$out/plus-jakarta-sans.woff2"
echo "subset-fonts: plus-jakarta-sans.woff2 $(wc -c < "$out/plus-jakarta-sans.woff2" | tr -d ' ') bytes"
cp "$(find "$work/jakarta" -name OFL.txt -not -path '*__MACOSX*' | head -n 1)" "$out/LICENSE-PlusJakartaSans.txt"

curl -fsSL -o "$out/LICENSE-CascadiaCode.txt" https://raw.githubusercontent.com/microsoft/cascadia-code/v2407.24/LICENSE
cp "$(find "$work/dejavu" -name LICENSE | head -n 1)" "$out/LICENSE-DejaVu.txt"
echo "subset-fonts: done, see $out"
