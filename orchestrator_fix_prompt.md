## ORCHESTRATOR TASK: Align codebase with master prompt

Repo root: `/media/sf_github/valuation-calc`. Authoritative spec: `masterprompt2.md` in the repo root (Parts 0–7). Full discrepancy audit: `audit_log.md` in the repo root. Every task below cites the spec section it implements; where a task says "verbatim from §X", the sub-agent must copy the code/data block from `masterprompt2.md` §X exactly — no invented or estimated figures anywhere in this job.

Global rules for all sub-agents:
1. TypeScript strict mode throughout; keep existing code style (JSDoc'd pure functions, RangeError guards).
2. Never fabricate financial data. The only data source for SIA figures is `masterprompt2.md` Part 6.
3. Units: millions of reporting currency unless per-share; SIA is SGD, fiscal year ends 31 March.
4. Package boundary rule (Part 0): `contract` depends on nothing; everything else depends on `contract`; `valuation-creator/core` imports `contract` and NOTHING else (no React, DOM, network, adapter).
5. After each work package, run `pnpm -r build` and `pnpm -r test` and fix regressions before reporting done.

Execution order: WP-A first (everything depends on the contract). Then WP-B, WP-C, WP-D may run in parallel. WP-E and WP-F after WP-A + WP-D. WP-G last.

---

### WP-A — Contract package (Part 4). One sub-agent. BLOCKING: do this first.

**A1. Replace `packages/contract/src/financials.ts` entirely.** [Spec: Part 4 `financials.ts` code block]
Delete the current flat single-period `FinancialStatements` and the wrong `MarketDataProvider` (`getPrice/getSharesOutstanding/getMarketCap/getDividendYield`). Write verbatim from §Part 4:
- `export type Exchange = 'SGX' | 'NYSE' | 'NASDAQ' | 'SEHK' | 'TSE' | 'KOSE' | 'LSE' | string;`
- `export interface CompanyRef { id; name; ticker; reportingCurrency }`
- `export interface FinancialStatements` with `fiscalYears: string[]`, `currency: string`, and the exact `incomeStatement` (11 array fields), `balanceSheet` (30 array fields), `cashFlow` (8 array fields) members listed in Part 4.
- `export interface MarketData { currentPrice; sharesOutstanding; week52High; week52Low; marketValueOfDebt; cash; currency }`
- `export interface PeerData` with the 19 fields listed in Part 4 (incl. `fxToTargetCurrency`, `equityBeta5Y`, `ntmPE`, `ntmEvEbitda`).
- `export interface MarketDataProvider { searchTicker(ticker, exchange): Promise<CompanyRef>; getFinancials(id): Promise<FinancialStatements>; getMarketData(id): Promise<MarketData>; getPeer(ticker, exchange): Promise<PeerData>; }`

**A2. Leave `packages/contract/src/extraction.ts` unchanged** — it already matches Part 4. Keep `index.ts` re-exports.

---

### WP-B — Bot 1: extraction pipeline (Part 1). One sub-agent.

**B1. Fix the canonical tag list in `packages/financial-statement-extract/EXTRACTION_PROMPT.md`.** [Spec: Part 1 "CANONICAL TAGS"]
In the balance_sheet tag list add: `short_term_investments`, `prepaid_expenses`, `long_term_investments`, `accrued_expenses`, `deferred_revenue_current`, `other_current_liabilities`, `deferred_revenue_non_current`, `pension_opeb`, `other_non_current_liabilities`. In the cash_flow tag list add: `depreciation_amortization`, `capex_purchase_of_ppe`, `proceeds_from_disposal_of_ppe`, `dividends_paid`. Match the Part 1 tag list exactly (same names, no extras removed).

**B2. Add the missing pipeline modules in `packages/financial-statement-extract/src/`.** [Spec: Part 0 tree "page finder, LLM call, JSON parse, tie-out validation"; Part 1 pipeline notes]
- `pageFinder.ts`: given per-page extracted text, return the indices of pages containing "Statement of Financial Position", "Profit or Loss", or "Cash Flows" (case-insensitive), so only those pages are sent to the LLM.
- `extract.ts`: an LLM-call wrapper (provider-agnostic function type is fine) that sends the `EXTRACTION_PROMPT.md` system prompt at temperature 0, requests JSON mode where supported, and pipes the response through the existing `parser.ts` `parse()`.
- `reviewQueue.ts`: a routing step — any parsed `ExtractionResult` with non-empty `extraction_warnings` OR any `tieOut()` violations goes to a review queue (an in-memory/JSON-file queue type is sufficient); clean results go to the clean store. [Spec: Part 1 "After parsing" paragraph]
- `index.ts` re-exporting parser, tieOut, pageFinder, extract, reviewQueue.

**B3. Add `build` and `test` scripts to `packages/financial-statement-extract/package.json`** matching the sibling packages (tsc build; vitest if tests are added).

---

### WP-C — Adapter + ExtractionProvider (Part 3). One sub-agent. Requires WP-A.

**C1. Rewrite `packages/adapter/src/toFinancialStatements.ts` to the Part 3 signature.** [Spec: Part 3 header code block]
```ts
export function toFinancialStatements(reports: ExtractionResult[]): {
  statements: FinancialStatements; warnings: string[];
};
```
Preserve the existing stitching logic where it complies, and implement steps (a)–(e) exactly:
- (a) Stitch into ≥5 fiscal years: sort by `period_end`, expand each report into current + comparative year columns, merge into one timeline keyed by fiscal year, output `fiscalYears: string[]` (e.g. `["2021",...,"2025"]`) with parallel arrays. Where two reports overlap on a year, cross-check earlier-current vs later-comparative; on mismatch prefer the audited figure AND push a warning (the current code ranks silently — add the warning).
- (b) Assert `unit_multiplier` consistency across reports and that every report's `currency` equals the output `currency`; on violation push a warning, do not convert.
- (c) Map tags → canonical Part 4 fields using the Part 3 table exactly, including the composite rules: `sga = administrative_expenses + distribution_costs`; `otherOpEx = other_expenses / operating_expenses`; `receivables = trade_receivables (+ other_receivables)`; `netPPE = ppe (+ right_of_use_assets — pick one treatment and document it in a comment)`; `longTermInvestments = long_term_investments + investments_in_associates_jv`; `otherLTAssets = other_non_current_assets (+ deferred_tax_assets)`; `accrued = accrued_expenses / other_payables`; `commonEquity = share_capital (+ reserves, − treasury_shares)`; `cashFlow.dandA = depreciation_amortization`; `cashFlow.capex = capex_purchase_of_ppe`; `cashFlow.commonDividendsPaid = dividends_paid`; etc. — every row of the table. Unmapped required field → 0 + warning.
- (d) Derive `changeReceivables`, `changeInventory`, `changePayables`, `changeUnearnedRev`, `changeOtherNWC` as year-over-year differences of the mapped balance-sheet items — never from the cash flow statement.
- (e) Re-run tie-outs (`total_assets == totalLiabilities + totalEquity` etc.) on the assembled result; forward every failure and every input `extraction_warning` into `warnings`.

**C2. Create `packages/valuation-creator/src/providers/ExtractionProvider.ts`.** [Spec: Part 3 final paragraph; Part 0 tree]
`getFinancials()` loads stored `ExtractionResult[]` and runs the adapter (import `@valuation-bot/adapter`). `searchTicker()`, `getMarketData()`, `getPeer()` delegate to the fixture/stub with a clear `// STUB: future market-data API` marker — price, shares, 52-week range, peer fundamentals and 5-year beta are not in annual reports.

**C3. Create `packages/valuation-creator/src/providers/FixtureProvider.ts`** implementing the Part 4 `MarketDataProvider` against the Part 6 fixture data (see WP-F1 for the data module). Delete `packages/valuation-creator/app/src/fixtures/FixtureProvider.ts` and `siaData.ts` after the app is rewired (WP-E). [Spec: Part 0 tree `src/providers/{FixtureProvider.ts, ExtractionProvider.ts}`; Part 2 "ship a FixtureProvider ... and an ExtractionProvider"]

---

### WP-D — Core valuation engine (Part 2). One sub-agent (or split D1–D6 across sub-agents). Requires WP-A.

**D1. Fix the exit-multiple terminal-value discounting in `packages/valuation-creator/core/src/dcf.ts`.** [Spec: §2.5 "PV of TV uses the final-period discount factor"; §6.7 reference: exit TV 23385.89 → PV 17918.93 = ÷(1.061)^4.5]
At `dcf.ts:264-272` the exit-multiple TV is discounted over `horizon` (N) periods. Change it to the final-period mid-year factor (N − 0.5), identical to the Gordon path. Update the module header comment (lines 20–25) accordingly. Apply the same N−0.5 convention to the exit-multiple branches in `sensitivity.ts` (`perShareValue(..., horizon, ...)` call at ~line 335) and `footballField.ts` (`exitDiscountFactor` at ~line 220).

**D2. Rework the forecast layer `packages/valuation-creator/core/src/forecast.ts` to the Part 2.2 driver model.** [Spec: §2.2; §6.3 assumption shapes; §6.8 Tier 2]
Replace the EBITDA-margin/pct-of-revenue drivers with: revenue growth per year (per scenario); COGS, SG&A, other operating expense each as % of revenue (scenario-driven; per-year arrays for COGS as in `SIA_ASSUMPTIONS.cogsPctRev`); capex as direct per-year currency inputs; D&A forecast (schedule consistent with reproducing §6.4's `SIA_FORECAST_DRIVERS.dandA` — calibrate and document); working capital on a days-outstanding basis (receivables/other receivables and inventory off revenue or COGS; payables, accrued, unearned revenue, prepaid, other current items likewise; non-operating balance-sheet items held flat); Bear/Base/Bull scenario toggle with editable offsets; recompute EBIT, EBITDA, EBT, tax, net income, and a balanced balance sheet + cash flow forward. Input type takes the last ≥5 historical years as the Part 4 `FinancialStatements` plus an assumptions object shaped like §6.3 `SIA_ASSUMPTIONS`. Acceptance: reproduces §6.4 `SIA_FORECAST_DRIVERS` (ebit, dandA, capex, changeNWC, fcff, ebitda, terminalEBITDA 4928.12, margin 0.2238) within tolerance (WP-F Tier 2); document the chosen working-capital-days convention in the module header.

**D3. Extend Hamada `packages/valuation-creator/core/src/hamada.ts`.** [Spec: §2.3]
Accept peers shaped from `PeerData`: `assetBeta = equityBeta5Y / (1 + (totalDebt/equityValue) * (1 − marginalTaxRate))` with `equityValue` already converted via `fxToTargetCurrency`. Keep the existing D/E form as a lower-level helper. Add outlier exclusion (per-peer `excluded?: boolean` honoured by the average). Acceptance: with the §6.4 peer table and Air France excluded-or-not per the documented rule, average asset beta = 0.4805 and relevered SIA beta (D/E 0.5174, tax 0.17) = 0.6868 within ±0.5%.

**D4. Extend WACC `packages/valuation-creator/core/src/wacc.ts`.** [Spec: §2.4]
Add optional derivation `preTaxKd = interestExpense / marketValueOfDebt` (direct `preTaxCostOfDebt` input remains and takes precedence when provided). Equity weight from `E = sharesOutstanding * currentPrice`. Acceptance (§6.7): Ke = 7.35%, after-tax Kd = 3.4%, WACC = 6.1% on the §6.2/§6.3 inputs (E = 20455.831, D = 9510.7).

**D5. Create the comps engine `packages/valuation-creator/core/src/comps.ts`.** [Spec: §2.5 "Comparable companies"]
- Convert peer figures to target currency via `fxToTargetCurrency`.
- Peer `EV = marketCap + (−cash + totalDebt + preferred + minorityInterest) * fx` where `marketCap = price * shares` (price/shares already in target-currency terms per the §6.5 table).
- Compute LTM & NTM P/E, P/B, EV/EBITDA multiples; statistics Avg / Min / 25th / Median / 75th / Max; apply to the target's metric; back out implied prices (for EV multiples: implied EV → − totalDebt + cash → equity → / shares).
- Export the median LTM EV/EBITDA for use as the DCF exit multiple.
Acceptance (§6.7): with `SIA_COMPS_PEERS` and the SIA target metrics in §6.5 — LTM EV/EBITDA implied min 3.7089 / mean 5.9166 / max 8.1244 (median multiple 4.7454x); LTM P/B 3.7512 / 5.2333 / 6.7154; NTM EV/EBITDA 3.9317 / 6.4582 / 8.9847; LTM P/E min 6.61 / median 7.51 / max 11.26. Tolerance ±0.5% or ±$0.02. Export in `index.ts`.

**D6. Sensitivity + football field.** [Spec: §2.6, §2.7, §6.6, §6.7]
- `sensitivity.ts`: add `ddmSensitivityGrid` (cost of equity rows × terminal growth columns, per-share DDM value); add the optional WACC × exit-multiple grid (§2.6 "expose multiple-grid as an option"); keep WACC × TGR and WACC × terminal-EBITDA-margin. Default steps: WACC/COE ±1%, EBITDA margin ±1%, growth ±0.5%, step size editable (`sensitivityRange` already supports this — set the spec defaults at the call sites).
- `footballField.ts`: rework to the 7 spec bars, in order: 1. DCF Gordon (point 9.8725), 2. DCF exit (point 5.9055), 3. LTM EV/EBITDA (min/mean/max from comps), 4. LTM P/B, 5. NTM EV/EBITDA, 6. DDM (point 3.8674), 7. 52-week high/low (6.21 / 6.92 / 7.63 from `MarketData`). Include `currentPrice` and `targetPrice` (= DCF exit-multiple implied price) in the result for overlay. Point bars carry min = mean = max = the point value.
- DCF result: add upside/(downside) vs current price (§2.5 bridge; SIA exit case: −9.0% vs $6.49).
- DDM: verify against §6.7 (PV dividends 2691.10 + PV TV 9498.67 = equity 12189.77 → $3.8674 with payout 0.4684, specials [0.10,0.10,0.10,0,0] × 3151.9 shares, Ke 7.35%, g 1.5%). If the current year-end discounting cannot reproduce it, adjust the convention (§2.5 lists all four models under the mid-year heading) and document the choice.

**D7. Make `core` consume the contract.** [Spec: Part 0 dependency rule]
Where core functions take company financials, market data, or peers, type them with `FinancialStatements`, `MarketData`, `PeerData` from `@valuation-bot/contract` (the dependency is already declared in `core/package.json`). Add a sign-convention unit test: feed a sign-flipped feed (e.g. positive capex / negative revenue) into the FCFF assembly and assert it is caught, not silently mis-valued. [Spec: §2.8]

---

### WP-E — App UI (Part 2 UI surface). One sub-agent. Requires WP-A + WP-D.

**E1. Rewrite `packages/valuation-creator/app/src/App.tsx` to the Part 7.3 flow:** search → assumptions panel → statements → beta/WACC → four valuations → sensitivity heatmaps → football field. [Spec: §2.1, §2.2, Part 7 item 3]
- Company search box (ticker + exchange filter) calling `MarketDataProvider.searchTicker`; on selection show name + reporting currency. Default/fixture: SIA via `FixtureProvider`.
- One labelled assumptions panel where EVERY assumption is user-editable (blue-input styling per the Excel convention), seeded from `SIA_ASSUMPTIONS` — delete the hardcoded `ASSUMPTIONS` const (current `App.tsx:44-57`, placeholder values Rf 0.03, MRP 0.05, exitMultiple 8, netDebt 0).
- Historical (≥5y) + forecast (5y) statements tables.
- Beta/WACC build view (peer asset betas with outlier-exclusion toggles, relevered beta, Ke, Kd, WACC).
- Four valuation outputs: DCF (both TVs, upside vs current), Gordon standalone headline, DDM, comps table (Avg/Min/25th/Median/75th/Max × P/E, P/B, EV/EBITDA, LTM & NTM).
- Sensitivity: render the three §2.6 grids as heatmap TABLES (colour-scaled cells, not line charts), axes per §6.6, step sizes editable.
- Football field: 7 horizontal min/mean/max bars with current-price ($6.49) and target-price ($5.9055) overlay lines.
- Surface adapter/extraction `warnings` on any data shown from `ExtractionProvider`. [Spec: Part 3(e)]
- Cache provider responses per company per session (simple Map keyed by `CompanyRef.id`). [Spec: §2.8]

**E2. Wire providers from the new location** `packages/valuation-creator/src/providers/` (WP-C3); delete `app/src/fixtures/` once unused. Providers must be swappable without touching `core`. [Spec: Part 2 intro]

**E3. `packages/valuation-creator/app/vite.config.ts`: add `base`** — `'/'` by default, switchable to `'/valuation-bot/'` via an env var (e.g. `VITE_BASE`), documented in DEPLOY.md. Add a build path that copies precomputed `FinancialStatements` JSON into static assets and a fetch-based provider reading it. [Spec: Part 5]

---

### WP-F — Fixtures + three test tiers (Part 6). One sub-agent. Requires WP-A + WP-D. THIS IS THE ACCEPTANCE GATE.

**F1. Create the fixture data module** (suggested: `packages/valuation-creator/src/providers/siaFixture.ts`, consumed by `FixtureProvider`): transcribe VERBATIM from `masterprompt2.md` §6.1–6.6: `SIA_FINANCIALS` (FinancialStatements, FY2021–FY2025), `SIA_MARKET` (MarketData), `SIA_ASSUMPTIONS`, `SIA_FORECAST_DRIVERS`, `SIA_BETA_PEERS`, `SIA_COMPS_PEERS`, and the §6.6 grid axes. Replace the empty TODO stubs currently in `packages/valuation-creator/app/src/fixtures/siaData.ts` (then delete that file). Do NOT re-derive or round any figure.

**F2. Rewrite Tier 1 — `packages/valuation-creator/core/__tests__/exactMath.test.ts`.** [Spec: §6.8 Tier 1; §6.7]
Delete the invented fixtures `__tests__/fixtures/siaValuation.ts` and their calibration constants (`netDebt: 25398.923`, `specialDividendsPerShare: [0.18809]`, invented peers, `marketValueOfEquity: 20000/28000`). Feed the engine the documented WACC inputs (Rf 1.97%, MRP 7.83%, preTaxKd 4.1%, tax 17%, E = 6.49 × 3151.9, D = 9510.7, `SIA_BETA_PEERS`) + the `SIA_FORECAST_DRIVERS` FCFF stream + DDM inputs (payout 0.4684, specials, Ke, g 1.5%) + `SIA_COMPS_PEERS`. Assert EVERY §6.7 reference number (tolerance ±0.5% or ±$0.02): Ke 7.35%; after-tax Kd 3.4%; WACC 6.1%; relevered beta 0.6868; avg asset beta 0.4805; ΣPV FCFF 1948.25; Gordon TV 39704.35 → PV 30422.60 → EV 32370.85 → equity 31117.25 → $9.8725; Exit (4.7454x × 4928.12) TV 23385.89 → PV 17918.93 → EV 19867.19 → equity 18613.59 → $5.9055 → upside −9.0%; DDM PV div 2691.10 + PV TV 9498.67 = 12189.77 → $3.8674 (NOTE: the current test wrongly labels 5.9055 as the DDM value — 5.9055 is the DCF exit-multiple implied price); all comps ranges (LTM EV/EBITDA 3.7089/5.9166/8.1244; LTM P/B 3.7512/5.2333/6.7154; NTM EV/EBITDA 3.9317/6.4582/8.9847; LTM P/E 6.61/7.51/11.26); football-field bars incl. 52-week 6.21/6.92/7.63.

**F3. Rewrite Tier 2 — `packages/valuation-creator/core/__tests__/forecast.test.ts`.** [Spec: §6.8 Tier 2]
Delete the invented `__tests__/fixtures/siaForecast.ts`. Feed `SIA_FINANCIALS` + `SIA_ASSUMPTIONS` (Base) into the reworked forecast layer and assert it reproduces `SIA_FORECAST_DRIVERS` (ebit, dandA, changeNWC, ebitda, fcff) within tolerance; calibrate the working-capital days convention to hit the documented balances and document the convention chosen in the fixture/test header.

**F4. Rebuild the adapter round-trip test.** [Spec: §6.8 "Adapter round-trip"]
Move it from `core/__tests__/adapterRoundTrip.test.ts` to `packages/adapter/__tests__/roundTrip.test.ts` (removing the cross-package relative import). Hand-build `ExtractionResult[]` for SIA (≥3 overlapping FY reports covering FY2021–FY2025, absolute units with `unit_multiplier`) such that `toFinancialStatements(reports).statements` deep-equals `SIA_FINANCIALS` and `warnings` is empty. Delete `core/__tests__/fixtures/siaExtraction.ts`.

---

### WP-G — Repo hygiene, docs, deployment, commit (Parts 0, 5, 7). One sub-agent. LAST.

**G1. Create `.gitignore`** at repo root: `node_modules/`, `dist/`, `.env`, `*.local`, `*.tsbuildinfo`. Delete the committed `packages/contract/tsconfig.tsbuildinfo` and `packages/valuation-creator/core/tsconfig.tsbuildinfo`. [Spec: Part 0 tree]

**G2. Create `README.md`** documenting the two-way JSON contract: the `ExtractionResult` schema (Bot 1 output), the `FinancialStatements`/`MarketData`/`PeerData` schemas (Bot 2 input), the adapter's role, the provider interface, the monorepo layout, and how to run/build/test. [Spec: Part 0 tree; Part 7 item 1]

**G3. Create `DEPLOY.md`** per Part 5: static-hosting constraint (extraction pipeline cannot run on Pages), the precomputed-JSON pattern (run extraction + adapter offline → write `FinancialStatements` JSON into app static assets → app fetches it, drop-in for the future live API), Vite `base` options (`'/'` for `keith2929.github.io` root — preferred, build here and push `dist` there — vs `'/valuation-bot/'` for a project page), and the build script. Do NOT push to the Pages repo. [Spec: Part 5]

**G4. Fix root `package.json`:** remove `"apps/*"` from `workspaces` (no such directory; `pnpm-workspace.yaml` is the source of truth). [Spec: Part 0 tree]

**G5. Add ESLint import-boundary enforcement** (flat config at root): `contract` may import nothing; `valuation-creator/core` may import only `@valuation-bot/contract`; `app` may not import `financial-statement-extract`; no cross-package relative imports (`../../../`). Wire `pnpm lint`. [Spec: Part 0 "Dependency rule (enforce via lint/import boundaries)"]

**G6. Initial commit and push** — only after `pnpm -r build`, `pnpm -r test`, `pnpm lint` all pass:
```bash
git init && git add . && git commit -m "Initial commit: SGX extraction + valuation monorepo with SIA fixture"
git branch -M main
git remote add origin https://github.com/keith2929/valuation-bot.git
git push -u origin main
```
If `git push` fails on auth, STOP and report — do not guess credentials. [Spec: Part 7 item 5]

---

### Verification checklist (orchestrator runs after all WPs)

1. `pnpm -r build` — zero TypeScript errors.
2. `pnpm -r test` — all three tiers green: Tier 1 asserts every §6.7 number; Tier 2 reproduces `SIA_FORECAST_DRIVERS`; adapter round-trip equals `SIA_FINANCIALS` with no warnings.
3. `pnpm lint` — import boundaries clean; `core/src` imports only `@valuation-bot/contract`.
4. Grep gate: no hardcoded assumption values left in `app/src` (search for `ASSUMPTIONS = {`); no `TODO: SIA Financials` stubs remain; no `25398.923` or `0.18809` calibration constants remain anywhere.
5. `contract/src/financials.ts` contains `Exchange`, `CompanyRef`, `MarketData`, `PeerData`, `MarketDataProvider.searchTicker` — and `extraction.ts` is byte-identical to before WP-A.
6. Exit-multiple TV discount factor uses N − 0.5 in `dcf.ts`, `sensitivity.ts`, `footballField.ts` (reference: 23385.89 → 17918.93 at WACC 6.1%, N = 5).
7. `EXTRACTION_PROMPT.md` tag list matches Part 1 exactly (spot-check `deferred_revenue_current`, `pension_opeb`, `capex_purchase_of_ppe`, `dividends_paid`).
8. App renders: search, assumptions panel, statements, beta/WACC, four valuations, three heatmap grids (§6.6 axes), 7-bar football field with $6.49 / $5.9055 overlays.
9. `README.md`, `DEPLOY.md`, `.gitignore` exist; repo pushed to `keith2929/valuation-bot` (or auth failure reported).

Do not deviate from these instructions. Verify each fix.
