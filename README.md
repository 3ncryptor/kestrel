# Kestrel

A portable ops cockpit for the terminal on macOS and Linux: an `htop`-style live view of what's using
your machine, plus `pm2`-style supervision of your project's stack, in one binary with no dependencies.

```sh
kestrel             # the dashboard: this machine, plus this project's stack (idle until you start it)
kestrel pm          # start this project's stack and manage it (restarts, readiness, logs)
kestrel sm          # system monitor only
kestrel init        # write kestrel.json from a Procfile or package.json scripts
kestrel import pm2  # convert a pm2 setup into kestrel.json
```

A stack is a `kestrel.json` next to your code (a Procfile or package.json scripts also work):

```json
{
  "version": 1,
  "processes": {
    "db":  { "cmd": "docker run --rm -p 5432:5432 postgres:16", "ready": { "port": 5432 } },
    "api": { "cmd": "npm run dev", "dependsOn": ["db"], "ready": { "http": "http://localhost:3000/health" } }
  }
}
```

> **Status: under construction.** M1 (engine), M2 (btop-style dashboard) and M3 (process manager) are
> built; M3 is in review. Distribution (binary, `curl | sh`, Homebrew, npm) is M4. Nothing is released yet.

| Doc | What it covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: users, features, CLI, release plan |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Architecture, store contract, platform adapter, milestones, distribution |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | Design tokens, screens, keymap, states, cognitive-design rules |
| [docs/DEV.md](docs/DEV.md) | Running tests, type checks and the Linux Docker loop |

License: [MIT](LICENSE)
