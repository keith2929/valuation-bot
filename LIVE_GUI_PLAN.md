# Live GUI: small-wins plan

## How to use this file

This is a living checklist, not a one-time plan. After finishing the work for
a stage, **declare it clear** by:
1. Changing that stage's heading from `## Stage N — ...` to
   `## Stage N — ... ✅ CLEAR (YYYY-MM-DD)`.
2. Filling in its `**Status:**` line with what was actually built/verified
   (not just what was planned — note any deviations).
3. Leaving the stage's bullet list intact underneath as a record, rather than
   deleting it.

Do not start a stage's work assuming an earlier stage is done unless it's
marked CLEAR here — re-verify if unsure.

## Context

The valuation-calc app originally only rendered one hardcoded fixture company
(SIA/C6L) via `FixtureProvider`. Goal: a live GUI where any ticker can be
searched, its real financials fetched, and DCF/DDM/comps valuations computed
— sequenced as small, independently-demoable wins rather than one big
backend+DB rollout.

## What already exists (reusable, do not rebuild)

- **`server.js`** (repo root) — plain-`http` Node server, loads `.env` via
  `dotenv`. `GET /api/search/:ticker` (identity only) and `GET
  /api/financials/:ticker` (full `CanonicalFinancialData`), both backed by
  `packages/orchestrator`. Never throws.
- **`packages/orchestrator`** — `fetchFinancials(ticker)` (full pipeline) and
  `resolveCompanyMeta(ticker)` (identity-only, skips `fetchFinancials` per
  adapter entirely — see `runAdapterMeta` in `orchestrator.ts`).
- **`packages/contract`** (`src/financials.ts`) — `MarketDataProvider`:
  `searchTicker`, `getFinancials` (→ `FinancialStatements`), `getMarketData`,
  `getPeer` (→ `PeerData`).
- **App provider plumbing** — `ProviderContext.tsx` picks `LiveApiProvider`
  when `VITE_API_BASE_URL` is set, else defaults to `FixtureProvider`.
  `CompanyContext.tsx` has `selectCompany(ticker, exchange)` wired to
  `provider.searchTicker`.
- **`packages/valuation-creator/app/src/providers/LiveApiProvider.ts`** —
  live provider; `searchTicker` implemented, `getFinancials`/`getMarketData`/
  `getPeer` still throw "not available until Step N".
- **Local dev**: `run-local.sh` builds the orchestrator, starts `server.js`
  (port 4501) and the app dev server (port 4502, set via `vite.config.ts`
  `server.port`/`VITE_DEV_PORT` — do NOT reintroduce CLI `--port` flags
  through `pnpm ... dev --`, that forwarding is broken with this pnpm/vite
  combo and silently falls back to 5173). Desktop shortcut: `~/Desktop/Valuation Calc.desktop`.
- **Env vars** (`.env`, gitignored): `FMP_API_KEY`, `ALPHAVANTAGE_API_KEY`,
  `POLYGON_API_KEY`, `SEC_EDGAR_USER_AGENT`. No `.env.example` currently —
  intentionally removed after it leaked a real key; recreate as a clean
  placeholder-only template if onboarding another machine/person.

## Confirmed gaps (checked against source, not assumed)

- No converter from `CanonicalFinancialData` (tag/value shape) to
  `FinancialStatements` (named-field shape DCF/DDM consume) exists yet —
  needed for Stage 2.
- `CanonicalMeta` has no sector/industry/SIC/market-cap-classification field.
  Needed for Stage 5 (dynamic peers); size can proxy off existing
  `sales`/`sharesOutstanding × currentPrice`, industry cannot.
- No adapter fetches price history — real 5y regression beta is out of scope
  for all 5 stages below; placeholder beta used instead.

---

## Stage 1 — Search for one ticker live ✅ CLEAR (2026-08-02)

**Status:** Implemented and verified. `resolveCompanyMeta()` added to
`packages/orchestrator/src/orchestrator.ts` (calls only `adapter.resolveMeta`,
never `fetchFinancials`; test asserts zero financial fetches). `GET
/api/search/:ticker` added to `server.js`. `LiveApiProvider.searchTicker`
validates the returned ticker matches the request (throws on mismatch/null
`companyName`, never silently falls back). "Load AAPL" button added to
`CompanySearchView.tsx`. Verified live: `curl localhost:4501/api/search/AAPL`
→ `{"ticker":"AAPL","companyName":"Apple Inc.","exchange":"US","currency":"USD"}`.
`FixtureProvider` path (no `VITE_API_BASE_URL`) confirmed unchanged.

- [x] `resolveCompanyMeta(ticker, options)` in orchestrator, metadata-only
- [x] `GET /api/search/:ticker` on `server.js`
- [x] `LiveApiProvider` env-gated via `VITE_API_BASE_URL`, fixture default preserved
- [x] Strict ticker-match validation (anti-cheat: mismatched/null response → visible error, not silent fallback)
- [x] "Load AAPL" demo button
- [x] `getFinancials`/`getMarketData`/`getPeer` explicitly throw "not available until Step N" (no leakage of fixture data as if live)

---

## Stage 2 — Get the financials (live)

**Status:** Not started.

- [ ] Write `CanonicalFinancialData → FinancialStatements` mapper
      (`LiveApiProvider/canonicalMapper.ts`)
- [ ] `readLine(statement, tag)` helper: returns value if present else `0`,
      pushes missing tag onto a `missingFields: string[]` (mirror the
      warnings pattern already in `packages/adapter/toFinancialStatements.ts`)
- [ ] Surface `missingFields` in the UI (reuse `ExtractionProvider`'s
      `getWarnings()` pattern)
- [ ] `LiveApiProvider.getFinancials` / `getMarketData` call
      `/api/financials/:ticker` and run the mapper
- [ ] Demo: real financial statements render for a live ticker; a
      yfinance-only ticker (likely missing fields) shows a visible warning,
      not a crash or silent zero

---

## Stage 3 — DCF/DDM valuation with a fake peer average

**Status:** Not started.

- [ ] `LiveApiProvider.getPeer` returns one hardcoded placeholder `PeerData`
      regardless of ticker
- [ ] Obviously-fake identifying fields (`name: "PLACEHOLDER PEER (not real data)"`,
      `ticker: "FAKE"`)
- [ ] Every numeric field real/non-zero/non-undefined, incl.
      `equityBeta5Y: 1.0` placeholder (undefined/0 breaks or silently
      corrupts WACC downstream)
- [ ] Persistent UI banner when placeholder peer data is active
- [ ] Demo: DCF/DDM produces a real implied price for a live ticker, peer
      inputs unmistakably marked placeholder, WACC doesn't NaN

---

## Stage 4 — Peer average from a hardcoded peer set

**Status:** Not started.

- [ ] Hardcoded sector → peer-ticker table, **US tickers only** for this pass
      (EDGAR/FMP coverage; skip yfinance-dependent international tickers like
      `005930.KS`/`6758.T` to avoid an international-data debugging detour)
- [ ] `LiveApiProvider.getPeer` calls `fetchFinancials` per peer ticker in
      the matching sector, maps into `PeerData` (sales/EBITDA/EBIT/
      earnings/book value from `CanonicalFinancialData`; beta stays fixed
      placeholder)
- [ ] Demo: comps/football-field view shows real averaged peer multiples for
      a US ticker in a covered sector

---

## Stage 5 — Dynamic peer selection by size + industry

**Status:** Not started.

- [ ] Add `sicCode`/`sicDescription` to `CanonicalMeta`
      (`packages/canonical/src/schema.ts`)
- [ ] Populate from EDGAR's `resolveMeta` (SEC submissions response already
      called for CIK/company-name resolution also carries `sic`/
      `sicDescription` — additive to an existing call)
- [ ] Size screen: proxy via existing `sales` or `sharesOutstanding ×
      currentPrice`, no new field needed
- [ ] Screening universe: US/EDGAR-covered tickers only for this pass
- [ ] Scope the actual selection algorithm (SIC match + size-band filter)
      only once Stage 4 is CLEAR and it's clear how noisy the size proxy is
      in practice

---

## Deferred / explicitly out of scope for Stages 1–5

- Real 5-year regression beta (needs a new price-history adapter + new
  canonical field + regression math — a separate future work package)
- Hosting (Render) + DB caching (Supabase) — layers in naturally after
  Stage 2 once there's something live worth caching/deploying; not a
  prerequisite for proving out functionality
