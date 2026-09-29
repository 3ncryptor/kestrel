# The Kestrel website

The landing page and docs at **https://kestrel-tui.vercel.app**, built with Next.js 16 (App Router), Tailwind 4,
Motion, GSAP and Lenis, and components from [DevClub UI](https://www.npmjs.com/package/@devclubnst/ui). Every page is
statically prerendered.

**The rule the site follows:** everything on it that looks like Kestrel *is* Kestrel. The dashboard and the crash in
"How it works", the quit dialog (press `q`), the `--help` text, the `kestrel init` output, the keys page, the colours
and the hero's meter bands are captured from the product,
not drawn by hand.

## Two stages

| Stage | Command | What it does |
|---|---|---|
| **generate** (Bun, at the repository root) | `bun run website:generate` | Renders the real dashboard headlessly (`scripts/website/`), captures the key map, CLI output and palette, and writes `website/src/generated/` |
| **build** (here, and on Vercel) | `bun run build` | Next.js turns the generated data, `../docs/CONFIG.md`, `../packaging/npm/README.md` and `../CHANGELOG.md` into static pages |

`src/generated/` is committed. **CI re-runs `website:generate` and fails if anything differs.** If you change the UI,
the help text, the version or the capture scripts, run it and commit the result. The generator runs in UTC and
from a fixed clock, so every machine produces the same files.

## Working on it

```sh
bun install                 # here, in website/ (the site is its own project, with its own bun.lock)
bun run dev                 # http://localhost:3000
bun run lint && bun run typecheck && bun run test
bun run build && bun run test:e2e   # Playwright + axe against the production build (bunx playwright install chromium once)
```

- **Components:** `src/components/ui/` holds DevClub UI components, added with its CLI
  (`npx @devclubnst/ui@2.0.1 add <name>`). They're our source now: adapted for strict TypeScript, accessibility (names
  on the switch and slider, valid list markup) and dark-only styling.
  - **Never add `@devclubnst/ui` as a dependency.** Its `dependencies` pin Next, React and `@vercel/analytics`.
- **Our own components:** `src/components/site/` has the landing sections and `src/components/docs/` the docs.
  `src/lib/` holds the frame decoder, the markdown pipeline (`docs.ts`, `docs-core.ts`) and the page list with the
  search index (`pages.ts`).
- **Fonts:** `public/fonts/` holds, about 51 KB in all:
  - Plus Jakarta Sans, the text face (the variable font, every weight in one file);
  - Kestrel Mono (subset from Cascadia Mono) and Kestrel Symbols (from DejaVu Sans Mono), for the terminal frames.
    They include braille for the CPU graph.

  `sh scripts/subset-fonts.sh` rebuilds them from pinned, checksummed downloads, byte for byte. The licences sit
  beside the fonts.

## Decisions worth knowing

- **Privacy.** The site loads nothing from another origin: no analytics, no web fonts from a CDN, no embeds. The
  end-to-end tests fail on any request that leaves the site. Keep Vercel Web Analytics and Speed Insights **off**.
- **CSP.** Scripts are `'self' 'unsafe-inline'`. Statically prerendered Next.js pages bootstrap with inline scripts,
  and nonces would force every page to render per request. The site has no user input, auth, cookies or third-party
  code, so this adds no real risk. Everything else is locked down in `next.config.ts`: no framing, no forms, no base
  URI, and HSTS.
- **Markdown** from the repository is rendered at build time with raw HTML dropped; a test proves that script and
  event-handler markup never reach a page.
- **Motion** goes through one gate (`src/components/motion/useMotionGate.ts`): `prefers-reduced-motion` turns it off
  everywhere:
  - no Lenis smoothing, text reveals or pinning;
  - the hero's CPU graph and the dashboard replay hold still.

  The graph and the replay also pause off-screen and in hidden tabs.
- **Search** (⌘K or `/`) is DevClub's spotlight search, shown like macOS Spotlight. Its index is a static
  `/search.json` built with the site, fetched the first time search opens.
- **Accessibility:**
  - axe (WCAG 2.1 AA) runs on every route in CI. The captured terminal frames are excluded, because they're the
    product's own output: `aria-hidden`, with a text alternative.
  - Small muted text uses `k-muted` (5.6:1 on black); the palette's `overlay0` is only for decoration.

## Deploying

Vercel's Git integration, with **Root Directory `website`**. `vercel.json` sets the Bun install and build commands.
It also skips a deploy when nothing the site depends on changed: this folder, `docs/CONFIG.md`, `CHANGELOG.md` and
the npm README. Pull requests get preview URLs, and merges to `main` deploy production.
