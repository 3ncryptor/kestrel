#!/bin/sh
# Decides which CI jobs a change needs (.github/workflows/ci.yml, "What changed").
#   git diff --name-only BASE HEAD | EVENT=pull_request sh scripts/ci-changes.sh
#   ALL=true EVENT=workflow_dispatch sh scripts/ci-changes.sh < /dev/null
# Prints key=value lines: code, platform, setup, engine, build, website, test-os (a JSON list of runners).
set -eu
EVENT=${EVENT:-pull_request}
all=${ALL:-false}
code=$all platform=$all setup=$all engine=$all packaging=$all website=$all

while IFS= read -r f || [ -n "$f" ]; do  # the last line may lack a newline
    [ -n "$f" ] || continue
    case "$f" in
        # Documentation and repository metadata: no product job needs to run. The website has its own job.
        *.md | docs/* | LICENSE | .editorconfig | .github/ISSUE_TEMPLATE/* | .github/CODEOWNERS | .github/dependabot.yml | website/*) ;;
        # A change to CI itself runs all of it.
        .github/workflows/ci.yml | scripts/ci-changes.sh) code=true platform=true setup=true engine=true packaging=true website=true ;;
        *) code=true ;;
    esac
    case "$f" in
        core/platform/* | core/processManager/* | core/stack/* | scripts/docker-* | scripts/e2e/* | scripts/fixture-server.js | tests/fixtures/*) platform=true ;;
    esac
    case "$f" in setup.sh | setup.ps1 | .husky/* | package.json | bun.lock) setup=true ;; esac
    case "$f" in core/* | scripts/bench.js) engine=true ;; esac
    case "$f" in scripts/build.js | packaging/* | cli/index.js | package.json | bun.lock) packaging=true ;; esac
    # The website: its own code, the documents it renders, and what it captures from the product (the UI,
    # the --help text, the version, the capture scripts).
    case "$f" in
        website/* | docs/CONFIG.md | CHANGELOG.md | packaging/npm/README.md | ui/* | cli/commands/help.js | scripts/website/* | package.json) website=true ;;
    esac
done

# Binaries: build tooling in a pull request, any code change on main.
build=$packaging
if [ "$EVENT" != pull_request ] && [ "$code" = true ]; then build=true; fi
# macOS (10x the cost of a Linux runner) when platform code changed, and always on main.
if [ "$platform" = true ] || { [ "$EVENT" != pull_request ] && [ "$code" = true ]; }; then
    test_os='["ubuntu-24.04","macos-15"]'
else
    test_os='["ubuntu-24.04"]'
fi

printf 'code=%s\nplatform=%s\nsetup=%s\nengine=%s\nbuild=%s\nwebsite=%s\ntest-os=%s\n' "$code" "$platform" "$setup" "$engine" "$build" "$website" "$test_os"
