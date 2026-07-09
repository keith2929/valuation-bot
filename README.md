# valuation-bot

A two-bot equity valuation pipeline: **Bot 1** extracts line items from annual
report PDFs into a structured JSON shape, **Bot 2** (this repo's `core`/`app`
packages) turns that shape into a full DCF/DDM/comps valuation with a
football-field summary. The two bots agree on a JSON contract so either side
can be swapped or re-run independently.

This document describes that contract, the pipeline that stitches Bot 1's
output into Bot 2's input, the pluggable data-provider interface, the
monorepo layout, and the Excel-replication conventions the valuation math
follows. It assumes the Singapore Airlines Ltd (SGX:C6L) model as the
reference example throughout, matching the fixtures shipped in the repo.

## The two-way JSON contract

All shared types live in `packages/contract/src` (`@valuation-bot/contract`,
no runtime dependencies). Every other package imports types from here rather
than redefining them, so the contract is the single source of truth for the
Bot 1 → Bot 2 boundary.

### `ExtractionResult` — Bot 1's output (`packages/contract/src/extraction.ts`)

One `ExtractionResult` represents a single filed report (e.g. one annual
report), carrying **two columns**: its current period and the comparative
prior period the report also discloses.

```ts
export interface ExtractionLine {
  tag: string | null;           // canonical line-item tag, or null if unmapped
  label: string;                // the label as printed in the source report
  value: number | null;         // current-period value
  value_comparative: number | null; // comparative-period value
}

export interface ExtractionResult {
  company_name: string;
  counter_code: string | null;
  currency: string;
  unit_multiplier: number;      // e.g. 1_000_000 if the report is in millions
  period_end: string;           // ISO date, e.g. "2025-03-31"
  comparative_period_end: string | null;
  period_type: 'FY' | 'HY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
  consolidated: boolean;
  audited: boolean;
  statements: {
    income_statement: ExtractionLine[];
    balance_sheet: ExtractionLine[];
    cash_flow: ExtractionLine[];
  };
  extraction_warnings: string[];
}
```

Bot 2 consumes an **array** of these (`ExtractionResult[]`) — typically one
per filed annual report, covering enough overlapping years to build a ≥5-year
timeline. `financial-statement-extract` (`@valuation-bot/financial-statement-extract`)
is Bot 1's implementation: PDF page-finding, parsing, tie-out checks, and a
review queue for low-confidence tags — see
`packages/financial-statement-extract/EXTRACTION_PROMPT.md` for the tagging
prompt/spec.

### `FinancialStatements` / `MarketData` / `PeerData` — Bot 2's input (`packages/contract/src/financials.ts`)

```ts
export interface FinancialStatements {
  fiscalYears: string[];   // e.g. ["2021","2022","2023","2024","2025"], ascending
  currency: string;
  incomeStatement: { revenue, cogs, sga, dandA, otherOpEx, ebit,
    interestExpense, interestIncome, incomeTaxExpense, netIncome,
    minorityInterest: number[] };
  balanceSheet: { cash, shortTermInvestments, receivables, inventory,
    prepaid, otherCurrentAssets, netPPE, longTermInvestments, goodwill,
    intangibles, otherLTAssets, totalAssets, accountsPayable, accrued,
    currentPortionLTDebt, currentLeases, taxesPayable, unearnedRevCurrent,
    otherCurrentLiabilities, longTermDebt, longTermLeases, pensionOPEB,
    deferredTaxLiability, otherNonCurrentLiabilities, totalLiabilities,
    commonEquity, retainedEarnings, minorityInterest, totalEquity,
    bookValueOfEquity: number[] };
  cashFlow: { dandA, capex, commonDividendsPaid, changeReceivables,
    changeInventory, changePayables, changeUnearnedRev,
    changeOtherNWC: number[] };
}

export interface MarketData {
  currentPrice: number; sharesOutstanding: number;
  week52High: number; week52Low: number;
  marketValueOfDebt: number; cash: number; currency: string;
}

export interface PeerData {
  name: string; ticker: string; fxToTargetCurrency: number;
  currentPrice: number; sharesOutstanding: number; cashAndSTInvestments: number;
  totalDebt: number; preferredEquity: number; minorityInterest: number;
  sales: number; ebitda: number; ebit: number; earnings: number; bookValue: number;
  equityBeta5Y: number; interestExpense: number; marginalTaxRate: number;
  ntmPE: number; ntmEvEbitda: number;
}
```

Every array field within one of these objects is index-aligned to
`fiscalYears` (for `FinancialStatements`) or to the caller's peer set (for
`PeerData`) — index `i` of `revenue` and index `i` of `netPPE` describe the
same fiscal year. `core`'s forecast/valuation functions require **at least 5
fiscal years** of history (the widest trailing window any driver uses).

### The `MarketDataProvider` interface (`packages/contract/src/financials.ts`)

```ts
export interface MarketDataProvider {
  searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef>;
  getFinancials(id: CompanyRef): Promise<FinancialStatements>; // >=5 fiscal years
  getMarketData(id: CompanyRef): Promise<MarketData>;
  getPeer(ticker: string, exchange: Exchange): Promise<PeerData>;
}
```

This is the single seam the `app` package's views (Assumptions, Statements,
Beta/WACC, Valuations, Sensitivity, Football field) are written against —
none of them know or care which implementation is behind it.

## The adapter's stitch/map/warn pipeline

`packages/adapter/src/toFinancialStatements.ts`
(`@valuation-bot/adapter`, function `toFinancialStatements`) is the Bot 1 →
Bot 2 bridge: it turns `ExtractionResult[]` into `{ statements: FinancialStatements, warnings: string[] }`.

```ts
import { toFinancialStatements } from "@valuation-bot/adapter";

const { statements, warnings } = toFinancialStatements(extractionResults);
```

It runs in five steps, matching Part 3 of the project's master prompt:

1. **Stitch.** Reports are sorted by `period_end` (order-insensitive input).
   Each report is exploded into a *current* and a *comparative* observation,
   grouped by fiscal year (the calendar year of `period_end`), so overlapping
   annual reports (FY2024's report carries both FY2024 and FY2023 columns)
   merge into one continuous timeline. Where two observations of the same
   year disagree on a tag, the **audited** figure wins (then consolidated
   over standalone, then a report's own current column over another report's
   comparative column) and a mismatch warning is pushed — never a silent
   pick.
2. **Map.** Canonical extraction tags (e.g. `"cost_of_sales"`,
   `"finance_costs"`) are mapped onto the `FinancialStatements` field names.
   Composite fields sum multiple tags (e.g. `sga` = `administrative_expenses`
   + `distribution_costs`; `commonEquity` = `share_capital` + `reserves` −
   `treasury_shares`); alternative fields take the first tag present (e.g.
   `otherOpEx` prefers `other_expenses`, falls back to `operating_expenses`).
   A field with no source tag for a year defaults to `0` and is warned once
   per field, listing every affected year.
3. **Derive working capital.** `changeReceivables`, `changeInventory`,
   `changePayables`, `changeUnearnedRev`, `changeOtherNWC` are computed as
   year-over-year differences of the *mapped balance-sheet* items — never
   read off the cash-flow statement, so they're consistent with whatever the
   balance sheet actually says even if the source cash-flow statement is
   incomplete.
4. **Tie out.** The assembled result is re-checked against the accounting
   identity `totalAssets == totalLiabilities + totalEquity` per year
   (skipped for years where any of the three totals was itself defaulted to
   0, so a sparse extraction doesn't produce a spurious tie-out failure).
5. **Warn.** Every `extraction_warnings` entry from every input report is
   forwarded, prefixed with which report it came from, alongside every
   mismatch/unmapped-field/tie-out warning generated above.

The result is deterministic and independent of input order — everything
derives from the `period_end`-sorted timeline, not from array position.

## Provider implementations

Three concrete `MarketDataProvider`s ship in this repo, each suited to a
different data source:

- **`FixtureProvider`** (`packages/valuation-creator/src/providers/FixtureProvider.ts`,
  package `@valuation-bot/valuation-creator`) — serves the embedded SIA
  reference fixture (`siaFixture.ts`: `SIA_FINANCIALS`, `SIA_MARKET`,
  `SIA_COMPS_PEERS`, `SIA_BETA_PEERS`). No I/O; used as the default data
  source and in every test/demo that doesn't need live or extracted data.
- **`ExtractionProvider`** (`packages/valuation-creator/src/providers/ExtractionProvider.ts`,
  same package) — `getFinancials` loads a company's stored
  `ExtractionResult[]` from an `ExtractionResultStore` (an in-memory
  implementation, `InMemoryExtractionResultStore`, ships by default) and runs
  them through `@valuation-bot/adapter`'s `toFinancialStatements`. The
  adapter's `warnings` are cached and exposed via `getWarnings(id)` (a
  duck-typed extra method, not part of the `MarketDataProvider` interface
  itself — see `WarningsCapableProvider` below). `searchTicker`,
  `getMarketData`, and `getPeer` can't be sourced from annual reports (price,
  shares outstanding, peer fundamentals, and 5-year beta never appear in a
  filed statement), so they delegate to a `FixtureProvider` by default —
  swap in a live-quote implementation there once one exists.
- **`StaticJsonProvider`** (`packages/valuation-creator/app/src/providers/StaticJsonProvider.ts`,
  app-only) — for the GitHub Pages deploy, where nothing server-side can run.
  `getFinancials` fetches a precomputed `{statements, warnings}` JSON that
  `emit-static` (see below) wrote ahead of time; everything else delegates to
  a fixture/live provider, same pattern as `ExtractionProvider`.

The app also layers a `CachedMarketDataProvider` decorator
(`packages/valuation-creator/app/src/providers/CachedMarketDataProvider.ts`)
around any of the three — a per-session in-memory cache keyed by company id
(or `exchange:TICKER` for `searchTicker`/`getPeer`, which run before a
`CompanyRef` exists) that also de-dupes concurrent in-flight requests. It
forwards `getWarnings` to the delegate when present (`WarningsCapableProvider`),
so wrapping `ExtractionProvider`/`StaticJsonProvider` in the cache doesn't
hide adapter warnings from the UI. `App.tsx` wires
`new CachedMarketDataProvider(new FixtureProvider())` in by default via
`ProviderContext.tsx`'s `<DataProvider>`; pass a different provider there to
point the whole app at extracted or static data instead.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`), 6 buildable packages:

```
packages/
  contract/                        @valuation-bot/contract
    src/{extraction,financials,index}.ts   — the JSON contract types (no deps)

  financial-statement-extract/     @valuation-bot/financial-statement-extract
    src/{parser,tieOut,pageFinder,extract,reviewQueue}.ts   — Bot 1

  adapter/                         @valuation-bot/adapter
    src/toFinancialStatements.ts   — Bot 1 -> Bot 2 stitch/map/warn pipeline
    __tests__/roundTrip.test.ts

  valuation-creator/
    core/                          @valuation-bot/valuation-creator-core
      src/{forecast,dcf,ddm,wacc,hamada,comps,sensitivity,footballField,index}.ts
        — pure valuation math: forecast schedules (P&L/PP&E/working
          capital/net income/balance sheet+cash flow), DCF, DDM, WACC,
          Hamada beta relevering, comps multiples, sensitivity grids,
          football field. No React, no I/O — only @valuation-bot/contract
          and internal imports.
      __tests__/   — 208 tests, incl. exact-math "golden" regression tests
                     transcribed from the source Excel workbook

    src/                           @valuation-bot/valuation-creator
      providers/{FixtureProvider,ExtractionProvider,siaFixture}.ts
        — MarketDataProvider implementations + the embedded SIA fixture

    app/                           @valuation-bot/valuation-creator-app
      src/
        providers/   — CachedMarketDataProvider, StaticJsonProvider, ResponseCache, ProviderContext
        company/     — CompanyContext (selected CompanyRef)
        assumptions/ — AssumptionsContext (editable ForecastAssumptions), derived.ts, BlueInput
        forecast/    — toCoreForecast.ts (adapts app assumptions -> core's buildForecast input)
        views/       — CompanySearchView, AssumptionsView, StatementsView, BetaWaccView,
                       ValuationsView, SensitivityView, FootballFieldView
        AppShell.tsx, App.tsx
      scripts/emitStatic.ts   — offline: run a provider once, write public/data/<ticker>.json
      __tests__/   — component + integration tests (vitest + @testing-library/react + jsdom)
```

`core` has zero React/DOM/adapter dependencies by construction (enforced by a
regression test that greps its imports) — it can be reused by any future
consumer (a CLI, a different UI) without pulling in the app.

## Excel-replication conventions

This model reproduces a specific source workbook (`Singapore Airlines
Limited Model (Final).xlsx`) formula-for-formula in several places where a
"more standard" approach would silently diverge from Excel's own numbers.
These conventions are load-bearing for the exact-math golden tests in
`core/__tests__` — changing them changes the goldens.

- **Mid-year discounting everywhere, including DDM.** Both `dcf.ts` and
  `ddm.ts` discount cash flows/dividends at *mid-year* periods
  `t = 0.5, 1.5, ..., N - 0.5` rather than year-end `t = 1, 2, ..., N`,
  approximating cash arriving throughout the year rather than as one lump
  sum on 31 December. The terminal value is *also* a mid-year-dated
  perpetuity and is discounted over `N - 0.5` periods, same as the final
  explicit-forecast cash flow. `dcf.ts` exports `midYearDiscountFactor`;
  `ddm.ts` (dividends accrue to equity, so they're discounted at the cost of
  equity, not WACC) reuses the identical mid-year period convention rather
  than a separate one.
- **Working capital is days-outstanding on a 365-day, trailing 3-fiscal-year
  average basis.** `forecast.ts`'s `daysOutstanding(line, base) = line/base
  * 365` and `trailingDaysOutstanding(line, base, windowYears)` average that
  ratio over the trailing window. `deriveOperatingAssumptions` applies this
  with `windowYears = 3` to every days-outstanding driver (receivables off
  revenue; inventory, prepaid, accounts payable, and accrued liabilities off
  COGS) — for the SIA fixture (`fiscalYears` ending at FY2025) that trailing
  window is FY2023–FY2025, held flat across all forecast years.
- **Qantas is excluded from the beta peer average.** `hamada.ts`'s
  `hamadaBetaFromPeers` averages only peers *not* flagged `excluded`; the SIA
  peer set (`SIA_BETA_PEERS` in `siaFixture.ts`) marks Qantas
  `excluded: true` as the source workbook's own outlier exclusion — including
  it shifts the average asset beta away from the workbook's anchor values
  (avg asset beta 0.4805, relevered equity beta 0.6868).
- **Comps percentiles use `QUARTILE.EXC`, not `QUARTILE.INC`/`PERCENTILE`.**
  `comps.ts`'s `quartileExc` implements Excel's exclusive-quartile
  interpolation (position `h = p * (n + 1)`, valid only for `h` inside
  `[1, n]` — mirroring `QUARTILE.EXC`'s `#NUM!` on too-small samples) for the
  p25/p75 legs of every peer multiple statistic
  (average/min/p25/median/p75/max), since the source workbook's `Comps`
  sheet uses `QUARTILE.EXC` throughout.

## Build / test / run

Requires Node ≥ 18 and `pnpm` (this repo pins `packageManager: pnpm@9.0.0`;
verified here against pnpm 9.0.0 / Node 22).

```bash
pnpm install         # first time / after any package.json change

pnpm -r build         # tsc --project tsconfig.json in every package (+ vite build in app)
pnpm -r test          # vitest run in every package that defines a "test" script
                       # (contract and financial-statement-extract have no runtime
                       # logic to test and define no "test" script; pnpm -r skips them)

pnpm --filter @valuation-bot/valuation-creator-app dev       # app dev server (Vite)
pnpm --filter @valuation-bot/valuation-creator-app build     # production build -> app/dist
pnpm --filter @valuation-bot/valuation-creator-app preview   # serve the production build locally
pnpm --filter @valuation-bot/valuation-creator-app emit-static  # write public/data/<ticker>.json
                                                                  # for the GitHub Pages static deploy
                                                                  # (see scripts/emitStatic.ts)
```

Root-level `pnpm build`/`pnpm test`/`pnpm dev` are shorthands for the `-r`
commands above (see the root `package.json`'s `scripts`).

### vboxsf note

If this repo is checked out on a VirtualBox shared folder (`vboxsf`), `pnpm`
cannot create the symlinks it normally uses to link workspace packages into
each other's `node_modules` — this repo's `.npmrc` already sets
`node-linker=hoisted` and `symlink=false` to work around that by hoisting and
copying instead of symlinking. Two consequences:

1. **`tsc` project-reference builds need a package's `dist/` to be up to
   date before a *dependent* package's build will see recent changes** —
   `pnpm -r build` builds packages in dependency order so this is normally
   transparent, but if you `tsc --project tsconfig.json` inside a single
   package directly, rebuild its upstream dependencies first (or just run
   `pnpm -r build` from the repo root).
2. **The Vite dev server bypasses this entirely.** `app/vite.config.ts`
   aliases every `@valuation-bot/*` workspace package straight to its
   `src/index.ts` (not through `node_modules`/`dist`), so `pnpm --filter
   @valuation-bot/valuation-creator-app dev` always reflects current source,
   even mid-edit and even if `pnpm -r build` hasn't been re-run.

If you ever see a stale-looking type error in `app` right after editing
`core`/`adapter`/`contract`/the root `valuation-creator` package, run
`pnpm -r build` from the repo root before re-investigating — it's very
likely just a stale `dist/`, not a real type error.
