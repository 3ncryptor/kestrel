// scripts/ci-changes.sh decides which CI jobs run: a wrong answer silently skips tests, so every rule
// is pinned here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ci-changes.sh');

function classify(files, { event = 'pull_request', all = false } = {}) {
    const out = execFileSync('sh', [SCRIPT], {
        input: files.join('\n'),
        env: { PATH: process.env.PATH, EVENT: event, ALL: String(all) },
        encoding: 'utf-8',
    });
    return Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')).map(([k, v]) => [k, k === 'test-os' ? JSON.parse(v) : v === 'true']));
}

test('a docs-only change runs nothing', () => {
    assert.deepEqual(classify(['README.md', 'docs/DEV.md', 'CONTRIBUTING.md', '.github/ISSUE_TEMPLATE/bug_report.yml', 'LICENSE']), {
        code: false, platform: false, setup: false, engine: false, build: false, 'test-os': ['ubuntu-24.04'],
    });
});

test('a website-only change runs no job: CI covers the package, and Vercel builds the site', () => {
    assert.deepEqual(classify(['website/app/page.tsx', 'website/bun.lock']), {
        code: false, platform: false, setup: false, engine: false, build: false, 'test-os': ['ubuntu-24.04'],
    });
});

test('an OS-independent code change in a pull request tests on Linux only', () => {
    const r = classify(['core/store/selectors.js', 'tests/unit/selectors.test.js']);
    assert.deepEqual([r.code, r.platform, r.engine, r.setup, r.build], [true, false, true, false, false]);
    assert.deepEqual(r['test-os'], ['ubuntu-24.04']);
    assert.equal(classify(['ui/components/logs.jsx']).engine, false, 'the UI is not engine code');
});

test('platform or process code adds macOS and the Linux containers', () => {
    for (const f of ['core/platform/darwinFfi.js', 'core/processManager/supervisor.js', 'scripts/e2e/pm-e2e.sh']) {
        const r = classify([f]);
        assert.equal(r.platform, true, f);
        assert.deepEqual(r['test-os'], ['ubuntu-24.04', 'macos-15'], f);
    }
});

test('setup files and dependencies run the developer setup; build tooling builds the binaries', () => {
    assert.equal(classify(['setup.ps1']).setup, true);
    assert.equal(classify(['.husky/pre-commit']).setup, true);
    const deps = classify(['bun.lock']);
    assert.deepEqual([deps.setup, deps.build, deps.code], [true, true, true]);
    assert.equal(classify(['packaging/install.sh']).build, true);
});

test('pushes to main build the binaries and test on macOS whenever code changed', () => {
    const r = classify(['core/store/index.js'], { event: 'push' });
    assert.equal(r.build, true);
    assert.deepEqual(r['test-os'], ['ubuntu-24.04', 'macos-15']);
    assert.equal(classify(['README.md'], { event: 'push' }).build, false, 'but not for docs');
});

test('a change to CI itself, or a manual run, runs everything', () => {
    for (const r of [classify(['.github/workflows/ci.yml']), classify(['scripts/ci-changes.sh']), classify([], { event: 'workflow_dispatch', all: true })]) {
        assert.deepEqual([r.code, r.platform, r.setup, r.engine, r.build], [true, true, true, true, true]);
    }
});
