## What and why

<!-- What this changes and the problem it solves. Link the issue: "Fixes #123". -->

## How it was tested

<!-- New or changed tests; for UI changes, the states you checked; for performance, before/after numbers
     from scripts/bench.js or scripts/bench-ui.jsx. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:bun` and `npm run test:ui` pass
- [ ] Tests cover the change (written first where possible)
- [ ] Docs updated where behaviour changed (README, docs/CONFIG.md, UI_SPEC, BUILD_PLAN)
- [ ] If the store/actions contract changed: BUILD_PLAN §6, `core/store/types.js` and the contract test are updated together
- [ ] Commits follow Conventional Commits and each one passes the suites on its own
