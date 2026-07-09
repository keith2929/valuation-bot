# Deployment (GitHub Pages)

## Static-hosting constraint

The app (`packages/valuation-creator/app`) can be built to static assets and served
from GitHub Pages. The **extraction pipeline cannot** — it depends on an LLM call plus
PDF parsing (`@valuation-bot/adapter` + whatever upstream extraction service produces
`ExtractionResult[]`), both of which need a live backend process. Pages only serves
static files, so there is no way to run that pipeline at request time in this
deployment target.

## Precomputed-JSON stand-in

Instead of hitting a live API at runtime, financials are precomputed offline and
checked in as static JSON, then fetched by the deployed app:

- `app/scripts/emitStatic.ts` runs any `MarketDataProvider.getFinancials` (e.g. the
  fixture provider, or a real extraction provider run locally where the LLM/PDF
  pipeline *can* run) and writes the result to `app/public/data/<ticker>.json`.
  Run it with `pnpm --filter app emit-static` (uses `vite-node --script`, since this
  environment's Node build has no working native TypeScript support).
- `app/src/providers/StaticJsonProvider.ts` implements `MarketDataProvider.getFinancials`
  by `fetch(`${import.meta.env.BASE_URL}data/<ticker>.json`)`, and delegates every other
  method (`searchTicker`, `getMarketData`, `getPeer`, ...) to a wrapped fixture/live
  provider, the same decorator pattern as `CachedMarketDataProvider`.

In other words: whatever `<ticker>.json` files exist under `app/public/data/` at build
time are the entire "backend" a Pages deploy has — there is no server-side extraction
step in production.

## Vite `base` options

`app/vite.config.ts` reads `base: process.env.VITE_BASE ?? "/"`:

- **`/` (default, preferred)** — for deploying `dist/` as the root of the
  `keith2929.github.io` user/org Pages repo. Asset URLs are emitted as `/assets/...`.
- **`/valuation-bot/`** — for deploying as a GitHub *project* page
  (`keith2929.github.io/valuation-bot/`) instead, e.g. if this repo is published
  under its own name rather than folded into the user site. Asset URLs are emitted
  as `/valuation-bot/assets/...`.

## Build commands

Run from `packages/valuation-creator/app`:

```bash
# user/org page: keith2929.github.io (default base "/")
pnpm build

# project page: keith2929.github.io/valuation-bot/
VITE_BASE=/valuation-bot/ pnpm build
```

Both invocations run `tsc --project tsconfig.json && vite build` and were verified
locally: the default build emits `dist/index.html` with `src="/assets/..."`, and the
`VITE_BASE=/valuation-bot/` build emits `src="/valuation-bot/assets/..."`.

To regenerate the static data JSON before a build:

```bash
pnpm --filter app emit-static
```

## Do not push to the Pages repo in this pass

This task only produces and verifies the `dist/` output locally. **Do not** push
`dist/` (or anything else) to `keith2929.github.io` or any other Pages repo as part
of this work package — that is a separate, explicit deployment step for later.
