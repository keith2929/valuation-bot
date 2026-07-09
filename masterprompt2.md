# MASTER PROMPT — SGX Extraction + Public-Equity Valuation Bot (standalone)
> Paste this whole file into Claude Code as the initial task. It is fully self-contained: it
> defines the monorepo, the shared data contract, **Bot 1** (financial-statement extraction),
> **Bot 2** (valuation engine + UI), the adapter that joins them, and an **embedded Singapore
> Airlines fixture with reference outputs** so the whole thing runs and regression-tests on day
> one with no Excel file and no network.
>
> Target repo (initial commit): `https://github.com/keith2929/valuation-bot`
> UI later shown via: `https://github.com/keith2929/keith2929.github.io`
>
> Currency/units convention throughout: figures in **millions of reporting currency** unless a
> field is per-share; SIA reports in **SGD** with a **31 March fiscal year-end** (FY2025 = year
> ended 2025-03-31).
---
# PART 0 — Architecture & repo
Build a TypeScript monorepo with two bots that never touch each other's types — everything
crossing the boundary goes through one shared **contract** package, and an **adapter** does the
translation. Bot 1 turns SGX report pages into tagged-line-item JSON; Bot 2 forecasts and values
any company. They are joined by the adapter, which maps extraction output into the valuation
engine's input.
```
valuation-bot/                         # repo root — this is the INITIAL COMMIT
├── package.json                       # npm (or pnpm) workspaces: ["packages/*"]
├── tsconfig.base.json
├── README.md                          # documents the two-way JSON contract
├── DEPLOY.md                          # GitHub Pages plan (Part 5)
├── .gitignore                         # node_modules, dist, .env, *.local
└── packages/
    ├── contract/                      # SINGLE SOURCE OF TRUTH — types only, zero runtime deps
    │   └── src/{extraction.ts, financials.ts, index.ts}
    ├── financial-statement-extract/   # BOT 1 (Part 1)
    │   ├── EXTRACTION_PROMPT.md        # the system prompt from Part 1
    │   └── src/                        # page finder, LLM call, JSON parse, tie-out validation
    ├── adapter/                       # THE BRIDGE (Part 3): ExtractionResult[] -> FinancialStatements
    │   └── src/toFinancialStatements.ts
    └── valuation-creator/             # BOT 2 (Part 2)
        ├── core/                       # framework-agnostic engine — imports `contract` ONLY
        ├── app/                        # Vite + React UI
        └── src/providers/{FixtureProvider.ts, ExtractionProvider.ts}
```
Dependency rule (enforce via lint/import boundaries): `contract` depends on nothing; everything
else depends on `contract`; **`valuation-creator/core` imports `contract` and nothing else** — no
React, DOM, network, or adapter — so it can be lifted into the website repo untouched. Use
TypeScript throughout. Every financial formula lives in `core` and is unit-tested.
Note on folder names: if I created subfolders with spaces ("financial statement extract",
"valuation creator"), rename them to the slug forms above; spaces in workspace paths break
tooling. Preserve any content already inside them.
---
# PART 1 — Bot 1: SGX financial-statement extraction
Create `packages/financial-statement-extract/`. It selects statement pages from an SGX report,
calls an LLM at temperature 0 with the system prompt below, parses the JSON, and runs tie-out
validation before storing. The output type is `ExtractionResult` (defined in Part 4) — validate
parsed output against it and route anything with warnings to a review queue.
Pipeline notes: locate statement pages first (search extracted text for "Statement of Financial
Position", "Profit or Loss", "Cash Flows") and send only those pages, not the whole report. OCR
or pass page images to a vision model for scanned PDFs before this step. Request JSON mode /
structured output where the provider supports it.
## System prompt for the extraction call (write to `EXTRACTION_PROMPT.md`)
```
You are a precise financial-data extraction engine. You extract financial statements from
SGX-listed company reports (prepared under SFRS/IFRS) into structured JSON. You do not analyse,
summarise, or comment — you transcribe what is on the page into the schema, exactly as reported.
INPUT
One or more pages containing some or all of: the income statement (profit or loss / comprehensive
income), the balance sheet (statement of financial position), and the cash flow statement. A
single response may contain more than one statement.
OUTPUT
Return ONLY a single valid JSON object matching the schema at the end. No prose, no markdown, no
code fences. If you cannot extract anything, return the schema with empty statement arrays and an
entry in `extraction_warnings` explaining why.
UNITS AND SCALE (most important rule)
- Read the currency and unit scale from the header/column headers, e.g. "S$'000",
  "$ in thousands", "RM million", "US$".
- Report EVERY value in ABSOLUTE units. If the header says S$'000 and the page shows 12,345,
  output 12345000.
- Record the multiplier applied in `unit_multiplier` (1000 for thousands, 1000000 for millions,
  1 if already absolute).
- Record the reporting currency as a 3-letter ISO code in `currency` (SGD, USD, MYR, CNY, ...).
  If unclear, use your best read and add a warning.
SIGNS
- Values in (parentheses) or with a leading minus are NEGATIVE (e.g. (1,234) -> -1234000 at
  S$'000 scale).
PERIODS
- Extract BOTH the current period (`value`) and the comparative/prior period (`value_comparative`).
- Record `period_end` and `comparative_period_end` (ISO YYYY-MM-DD).
- Set `period_type` to FY, HY, Q1, Q2, Q3, or Q4.
SCOPE OF FIGURES
- `consolidated` = true for group/consolidated figures, false for company/standalone. If a page
  shows both, extract GROUP figures and add a warning.
- `audited` = true for audited annual figures, false for unaudited interim/preliminary. If
  unstated, infer and add a warning.
LINE ITEMS
- Preserve each printed label EXACTLY in `label` (e.g. "Turnover", "Finance costs").
- Map each line to a canonical tag from the list below in `tag`; if none fits, set `tag` to null —
  do NOT force a bad match.
- Extract subtotals/totals as their own line items (e.g. gross_profit, total_assets).
DO NOT FABRICATE
- Extract only what is present; omit absent line items. Never invent, estimate, or back-calculate.
- If a value is illegible or genuinely absent, set it to null and add a warning.
VALIDATION AWARENESS (report problems, do not fix them)
- If totals do not tie (total assets != current + non-current; assets != liabilities + equity),
  extract AS PRINTED and add a warning. Do not adjust to make figures tie.
- Warn on anything ambiguous: unclear scale, mixed currencies, truncation across pages, restated
  figures, etc.
CANONICAL TAGS (use where they fit, else null)
income_statement:
  revenue, cost_of_sales, gross_profit, other_income, distribution_costs,
  administrative_expenses, operating_expenses, other_expenses, operating_profit,
  finance_income, finance_costs, share_of_associates_jv, profit_before_tax, tax_expense,
  net_profit, profit_attributable_to_owners, profit_attributable_to_nci, eps_basic, eps_diluted
balance_sheet:
  cash_and_equivalents, short_term_investments, trade_receivables, other_receivables,
  inventories, prepaid_expenses, other_current_assets, total_current_assets, ppe,
  right_of_use_assets, investment_properties, intangible_assets, goodwill,
  investments_in_associates_jv, long_term_investments, deferred_tax_assets,
  other_non_current_assets, total_non_current_assets, total_assets, trade_payables,
  other_payables, accrued_expenses, borrowings_current, lease_liabilities_current,
  current_tax_payable, deferred_revenue_current, other_current_liabilities,
  total_current_liabilities, borrowings_non_current, lease_liabilities_non_current,
  deferred_revenue_non_current, pension_opeb, deferred_tax_liabilities,
  other_non_current_liabilities, total_non_current_liabilities, total_liabilities,
  share_capital, treasury_shares, reserves, retained_earnings, equity_attributable_to_owners,
  non_controlling_interests, total_equity
cash_flow:
  profit_before_tax_cf, depreciation_amortization, capex_purchase_of_ppe,
  proceeds_from_disposal_of_ppe, dividends_paid, net_cash_from_operating,
  net_cash_from_investing, net_cash_from_financing, net_change_in_cash,
  cash_beginning_of_period, effect_of_fx, cash_end_of_period
SCHEMA (return exactly this shape)
{
  "company_name": "string",
  "counter_code": "string or null",
  "currency": "SGD",
  "unit_multiplier": 1000,
  "period_end": "YYYY-MM-DD",
  "comparative_period_end": "YYYY-MM-DD or null",
  "period_type": "FY | HY | Q1 | Q2 | Q3 | Q4",
  "consolidated": true,
  "audited": true,
  "statements": {
    "income_statement": [
      { "tag": "revenue", "label": "Revenue", "value": 12345000, "value_comparative": 11000000 }
    ],
    "balance_sheet": [],
    "cash_flow": []
  },
  "extraction_warnings": []
}
Return the JSON object now and nothing else.
```
Why the extra `cash_flow` and `deferred_revenue` tags matter: the valuation DCF needs
`EBIT*(1-t) + D&A − Capex − ΔNWC`. D&A and capex live inside operating/investing activities and
cannot be reliably derived from the balance sheet — they must be transcribed
(`depreciation_amortization`, `capex_purchase_of_ppe`). Deferred/unearned revenue (SIA's advance
ticket sales) is a large operating balance the engine's working-capital forecast depends on.
`ΔNWC` itself is **not** extracted — the adapter derives it from consecutive balance sheets.
After parsing: validate in code that `total_assets == total_current_assets +
total_non_current_assets` and `total_assets == total_liabilities + total_equity`; route mismatches
or any non-empty `extraction_warnings` to a review queue rather than the clean table.
---
# PART 2 — Bot 2: valuation engine + UI
Create `packages/valuation-creator/` in two layers: `core/` (framework-agnostic engine, pure
functions, unit-tested, imports `contract` only) and `app/` (Vite + React UI calling `core`;
charts via Recharts or similar). All data access goes through the `MarketDataProvider` interface
(Part 4); ship a `FixtureProvider` (the SIA data in Part 6) so the app runs end-to-end offline,
and an `ExtractionProvider` (Part 3) that sources `getFinancials` from Bot 1. Providers must be
swappable without touching `core`.
This replicates my Singapore Airlines Excel model's methodology for any listed company. Every
assumption is a **user-editable input** (mirror the Excel's blue-input convention) shown in one
labelled assumptions panel — never hardcoded.
## 2.1 Company search
Search by **ticker** with an **exchange filter** so the provider call is scoped (fewer tokens).
On selection resolve `CompanyRef` and display name + reporting currency.
## 2.2 Statements + 5-year forecast (replica of the Excel)
Pull ≥5 years historical, then forecast 5 years:
- **Revenue** grows by a scenario growth rate per year.
- **COGS, SG&A, other operating expense** each forecast as a **% of revenue** (scenario-driven).
- **Working capital** on a **days-outstanding basis**: receivables/other receivables and inventory
  off revenue or COGS; payables, accrued, unearned revenue, prepaid, other current items likewise.
  Hold non-operating balance-sheet items flat.
- **Scenario toggle Bear / Base / Bull** shifting the key % assumptions (the Excel offsets each
  driver ~±1% between cases — expose the offsets as editable inputs; see Part 6 for SIA values).
- Recompute EBIT, EBITDA, EBT, tax, net income, and a balanced balance sheet + cash flow forward.
## 2.3 Beta — asset & equity (Hamada)
For each peer: `assetBeta = equityBeta5Y / (1 + (totalDebt/equityValue) * (1 - marginalTaxRate))`.
Average the peer asset betas (allow excluding outliers), then relever at the target's own capital
structure and tax rate:
`targetEquityBeta = avgAssetBeta * (1 + (targetD/E) * (1 - targetTaxRate))`.
Peer D/E uses `totalDebt` and market `equityValue` (converted via `fxToTargetCurrency`).
## 2.4 WACC
- **Cost of equity (CAPM):** `Ke = Rf + targetEquityBeta * MRP` (Rf ≈ 10Y sovereign yield; MRP
  editable — both user inputs, not from the feed).
- **Cost of debt:** `preTaxKd = interestExpense / marketValueOfDebt`;
  `afterTaxKd = preTaxKd * (1 - taxRate)`.
- **Weights:** `E = sharesOutstanding * currentPrice`, `D = marketValueOfDebt`, `V = D + E`.
- `WACC = Ke*(E/V) + afterTaxKd*(D/V)`.
## 2.5 Valuation models (all four; mid-year convention: periods 0.5,1.5,2.5,3.5,4.5)
- **DCF (FCFF)** — `FCFF = EBIT*(1 - taxRate) + D&A − Capex − ΔNWC`, discounted at WACC. Provide
  both terminal-value methods:
  - *Gordon Growth:* `TV = FCFF_terminal*(1 + g)/(WACC − g)`, g editable.
  - *Exit multiple:* `TV = terminalEBITDA * exitEV/EBITDA`, multiple = comps **median** LTM
    EV/EBITDA.
  - PV of TV uses the final-period discount factor. Bridge: `EV − totalDebt + cash = equity`;
    `/ shares = implied price`; report upside/(downside) vs current price.
- **Gordon Growth (standalone perpetuity)** on terminal-year FCFF — also surface as its own
  headline number.
- **DDM** — dividends from `payout ratio = average of the last 2 historical years`, plus an
  editable **special-DPS schedule** (special DPS × shares). PV dividends at **cost of equity**,
  add a Gordon-Growth terminal value discounted at Ke → equity value → implied price.
- **Comparable companies** — LTM & NTM **P/E, P/B, EV/EBITDA**. Convert peer figures to target
  currency via `fxToTargetCurrency`; compute peer multiples; take **Avg / Min / 25th / Median /
  75th / Max**; apply to the target's metric; back out implied price. Peer
  `EV = marketCap + (−cash + totalDebt + preferred + minorityInterest) * fx`.
## 2.6 Sensitivity analysis (heatmap tables, like Excel data tables)
- DCF (Gordon Growth): **WACC × terminal growth rate**.
- DCF (exit multiple): **WACC × terminal EBITDA margin** (the Excel also does WACC × exit multiple;
  build the margin grid as primary and expose multiple-grid as an option).
- DDM: **cost of equity × terminal growth rate**.
Center each grid on the base case; steps WACC/COE ±1%, EBITDA margin ±1%, growth ±0.5%; keep step
size editable. (SIA grid axes in Part 6.)
## 2.7 Football field
Horizontal Min / Mean / Max bars per method, overlaying **current price** and **target price**
(target = DCF exit-multiple implied price):
1. DCF (Gordon Growth)  2. DCF (exit multiple)  3. LTM EV/EBITDA  4. LTM P/B
5. NTM EV/EBITDA  6. DDM  7. 52-week high/low
## 2.8 Conventions
Match the sign conventions the feed returns; write the FCFF/CF assembly so a sign-flipped feed is
caught by a unit test, not silently mis-valued. Cache provider responses per company/session and
scope every call by exchange to conserve tokens.
---
# PART 3 — The adapter (joins Bot 1 → Bot 2)
Implement `packages/adapter/src/toFinancialStatements.ts`:
```ts
import type { ExtractionResult, FinancialStatements } from '@valuation-bot/contract';
export function toFinancialStatements(reports: ExtractionResult[]): {
  statements: FinancialStatements; warnings: string[];
};
```
**a. Stitch reports into ≥5 fiscal years.** Each report yields two columns (current +
comparative). Sort by `period_end`; expand each into (year → line map); merge into one timeline.
Where two reports overlap on a year, cross-check: the earlier report's *current* column should
equal the later report's *comparative* column; on mismatch prefer the **audited** figure and warn.
Dedupe to one value per year per field.
**b. Normalise scale/sign.** Values arrive already in absolute units; assert `unit_multiplier`
consistency and that every report's `currency` equals `FinancialStatements.currency` (warn, don't
silently convert).
**c. Map tags → canonical fields** (best-effort; unmapped required field → 0 + warning):
| FinancialStatements field | From tag(s) |
|---|---|
| `incomeStatement.revenue` | `revenue` |
| `incomeStatement.cogs` | `cost_of_sales` |
| `incomeStatement.sga` | `administrative_expenses` + `distribution_costs` |
| `incomeStatement.dandA` | `depreciation_amortization` |
| `incomeStatement.otherOpEx` | `other_expenses` / `operating_expenses` |
| `incomeStatement.ebit` | `operating_profit` |
| `incomeStatement.interestExpense` | `finance_costs` |
| `incomeStatement.interestIncome` | `finance_income` |
| `incomeStatement.incomeTaxExpense` | `tax_expense` |
| `incomeStatement.netIncome` | `net_profit` |
| `incomeStatement.minorityInterest` | `profit_attributable_to_nci` |
| `balanceSheet.cash` | `cash_and_equivalents` |
| `balanceSheet.shortTermInvestments` | `short_term_investments` |
| `balanceSheet.receivables` | `trade_receivables` (+ `other_receivables`) |
| `balanceSheet.inventory` | `inventories` |
| `balanceSheet.prepaid` | `prepaid_expenses` |
| `balanceSheet.otherCurrentAssets` | `other_current_assets` |
| `balanceSheet.netPPE` | `ppe` (+ `right_of_use_assets` — decide & document) |
| `balanceSheet.longTermInvestments` | `long_term_investments` + `investments_in_associates_jv` |
| `balanceSheet.goodwill` | `goodwill` |
| `balanceSheet.intangibles` | `intangible_assets` |
| `balanceSheet.otherLTAssets` | `other_non_current_assets` (+ `deferred_tax_assets`) |
| `balanceSheet.totalAssets` | `total_assets` |
| `balanceSheet.accountsPayable` | `trade_payables` |
| `balanceSheet.accrued` | `accrued_expenses` / `other_payables` |
| `balanceSheet.currentPortionLTDebt` | `borrowings_current` |
| `balanceSheet.currentLeases` | `lease_liabilities_current` |
| `balanceSheet.taxesPayable` | `current_tax_payable` |
| `balanceSheet.unearnedRevCurrent` | `deferred_revenue_current` |
| `balanceSheet.otherCurrentLiabilities` | `other_current_liabilities` |
| `balanceSheet.longTermDebt` | `borrowings_non_current` |
| `balanceSheet.longTermLeases` | `lease_liabilities_non_current` |
| `balanceSheet.pensionOPEB` | `pension_opeb` |
| `balanceSheet.deferredTaxLiability` | `deferred_tax_liabilities` |
| `balanceSheet.otherNonCurrentLiabilities` | `other_non_current_liabilities` |
| `balanceSheet.totalLiabilities` | `total_liabilities` |
| `balanceSheet.commonEquity` | `share_capital` (+ `reserves`, − `treasury_shares`) |
| `balanceSheet.retainedEarnings` | `retained_earnings` |
| `balanceSheet.minorityInterest` | `non_controlling_interests` |
| `balanceSheet.totalEquity` | `total_equity` |
| `balanceSheet.bookValueOfEquity` | `equity_attributable_to_owners` |
| `cashFlow.dandA` | `depreciation_amortization` |
| `cashFlow.capex` | `capex_purchase_of_ppe` |
| `cashFlow.commonDividendsPaid` | `dividends_paid` |
**d. Derive WC deltas** (`changeReceivables`, `changeInventory`, `changePayables`,
`changeUnearnedRev`, `changeOtherNWC`) as year-over-year differences of the mapped balance-sheet
items — not from the cash flow.
**e. Re-run tie-outs** on the assembled result and forward every failure + every input
`extraction_warning` into `warnings`. The UI flags anything with warnings.
Then implement `ExtractionProvider`: `getFinancials()` loads stored `ExtractionResult[]` and runs
the adapter. `getMarketData()` and `getPeer()` stay on the fixture/stub — price, shares, 52-week
range, peer fundamentals, and 5-year beta are **not** in annual-report statements and belong to
the future market-data API; keep them clearly stubbed so the swap is obvious.
---
# PART 4 — The `contract` package (single source of truth)
Put both schemas here. `financials.ts`:
```ts
export type Exchange = 'SGX' | 'NYSE' | 'NASDAQ' | 'SEHK' | 'TSE' | 'KOSE' | 'LSE' | string;
export interface CompanyRef { id: string; name: string; ticker: string; reportingCurrency: string; }
export interface FinancialStatements {
  fiscalYears: string[];              // e.g. ["2021","2022","2023","2024","2025"]
  currency: string;
  incomeStatement: {
    revenue: number[]; cogs: number[]; sga: number[]; dandA: number[]; otherOpEx: number[];
    ebit: number[]; interestExpense: number[]; interestIncome: number[];
    incomeTaxExpense: number[]; netIncome: number[]; minorityInterest: number[];
  };
  balanceSheet: {
    cash: number[]; shortTermInvestments: number[]; receivables: number[]; inventory: number[];
    prepaid: number[]; otherCurrentAssets: number[]; netPPE: number[]; longTermInvestments: number[];
    goodwill: number[]; intangibles: number[]; otherLTAssets: number[]; totalAssets: number[];
    accountsPayable: number[]; accrued: number[]; currentPortionLTDebt: number[]; currentLeases: number[];
    taxesPayable: number[]; unearnedRevCurrent: number[]; otherCurrentLiabilities: number[];
    longTermDebt: number[]; longTermLeases: number[]; pensionOPEB: number[]; deferredTaxLiability: number[];
    otherNonCurrentLiabilities: number[]; totalLiabilities: number[]; commonEquity: number[];
    retainedEarnings: number[]; minorityInterest: number[]; totalEquity: number[]; bookValueOfEquity: number[];
  };
  cashFlow: {
    dandA: number[]; capex: number[]; commonDividendsPaid: number[];
    changeReceivables: number[]; changeInventory: number[]; changePayables: number[];
    changeUnearnedRev: number[]; changeOtherNWC: number[];
  };
}
export interface MarketData {
  currentPrice: number; sharesOutstanding: number; week52High: number; week52Low: number;
  marketValueOfDebt: number; cash: number; currency: string;
}
export interface PeerData {
  name: string; ticker: string; fxToTargetCurrency: number;
  currentPrice: number; sharesOutstanding: number; cashAndSTInvestments: number; totalDebt: number;
  preferredEquity: number; minorityInterest: number; sales: number; ebitda: number; ebit: number;
  earnings: number; bookValue: number; equityBeta5Y: number; interestExpense: number;
  marginalTaxRate: number; ntmPE: number; ntmEvEbitda: number;
}
export interface MarketDataProvider {
  searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef>;
  getFinancials(id: CompanyRef): Promise<FinancialStatements>;   // >=5 fiscal years
  getMarketData(id: CompanyRef): Promise<MarketData>;
  getPeer(ticker: string, exchange: Exchange): Promise<PeerData>;
}
```
`extraction.ts`:
```ts
export interface ExtractionLine { tag: string | null; label: string; value: number | null; value_comparative: number | null; }
export interface ExtractionResult {
  company_name: string; counter_code: string | null; currency: string; unit_multiplier: number;
  period_end: string; comparative_period_end: string | null;
  period_type: 'FY' | 'HY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
  consolidated: boolean; audited: boolean;
  statements: { income_statement: ExtractionLine[]; balance_sheet: ExtractionLine[]; cash_flow: ExtractionLine[]; };
  extraction_warnings: string[];
}
```
---
# PART 5 — GitHub Pages deployment (set up, don't push yet)
GitHub Pages is static hosting: the Vite `app/` can run there; the **extraction pipeline cannot**
(it needs an LLM call + PDF parsing). Pattern: run extraction + adapter locally/offline, write
precomputed `FinancialStatements` JSON into the app's static assets, and have the app `fetch`
those — which is exactly the JSON contract the future live API will satisfy, so the static files
are a drop-in stand-in. Set Vite `base` correctly: `'/'` if deploying to the root of
`keith2929.github.io`, `'/valuation-bot/'` for a project page. Since `keith2929.github.io` is a
separate repo, prefer building here and pushing `dist` there for the clean root URL. Write a
`build` script and a `DEPLOY.md` describing both options; do not push to the Pages repo in this
pass.
---
# PART 6 — Embedded Singapore Airlines fixture + reference outputs
This is the reference model. Populate `FixtureProvider` with the data below and write unit tests
that reproduce the reference outputs. All figures in **SGD millions**; fiscal year ends 31 March;
historicals FY2021–FY2025, forecast FY2026–FY2030.
## 6.1 Historical statements (FY2021 → FY2025)  — `FinancialStatements`
```ts
export const SIA_FINANCIALS: FinancialStatements = {
  fiscalYears: ["2021","2022","2023","2024","2025"],
  currency: "SGD",
  incomeStatement: {
    revenue:          [3815.9, 7614.8, 17774.8, 19012.7, 19539.8],
    cogs:             [3551.8, 5391.3, 11143.0, 12366.3, 13292.1],
    sga:              [-1.0,   238.7,  814.4,   809.0,   830.5],
    dandA:            [2075.9, 1927.6, 2004.9,  2109.6,  2308.2],
    otherOpEx:        [631.9,  595.9,  1018.4,  895.0,   1292.7],
    ebit:             [-2508.5,-610.7, 2718.5,  2756.6,  1743.5],   // operating income
    interestExpense:  [-264.7, -386.8, -416.2,  -418.1,  -389.9],
    interestIncome:   [43.8,   49.9,   416.6,   631.7,   494.1],
    incomeTaxExpense: [-673.8, -141.9, 473.5,   342.0,   152.6],
    netIncome:        [-4270.7,-962.0, 2156.8,  2674.8,  2778.0],
    minorityInterest: [12.7,  -13.9,  -6.5,    -20.3,   -34.2],
  },
  balanceSheet: {
    cash:                     [7783.0, 13762.7, 16327.6, 11256.0, 8257.1],
    shortTermInvestments:     [292.7,  424.5,   426.4,   1315.4,  965.1],
    receivables:              [1035.9, 1750.8,  1524.7,  1865.9,  1593.6],  // total receivables
    inventory:                [194.9,  187.4,   227.0,   268.0,   344.9],
    prepaid:                  [80.7,   93.2,    105.0,   153.9,   109.9],
    otherCurrentAssets:       [284.8,  1464.0,  607.4,   706.5,   91.9],
    netPPE:                   [19811.5,19637.4, 19258.7, 20390.2, 21207.5],
    longTermInvestments:      [1189.3, 1241.6,  1250.6,  1285.7,  4666.1],
    goodwill:                 [14.0,   14.0,    1.6,     6.3,     6.3],
    intangibles:              [230.9,  219.3,   212.8,   214.4,   230.8],
    otherLTAssets:            [6663.6, 9870.6,  9078.2,  6726.4,  5580.1],  // incl deferred charges
    totalAssets:              [37581.3,48671.0, 49101.2, 44264.7, 43086.8],
    accountsPayable:          [1676.4, 2408.8,  3932.3,  4259.3,  4509.2],
    accrued:                  [71.7,   72.5,    66.2,    57.6,    50.1],
    currentPortionLTDebt:     [1310.8, 844.2,   2547.9,  915.5,   2213.4],
    currentLeases:            [491.4,  567.7,   617.3,   613.0,   536.9],
    taxesPayable:             [95.4,   153.3,   128.1,   68.2,    72.5],
    unearnedRevCurrent:       [1537.2, 3046.2,  5519.2,  5787.4,  5839.8],
    otherCurrentLiabilities:  [530.3,  775.9,   859.9,   970.7,   733.2],
    longTermDebt:             [10827.3,11405.7, 8613.7,  8737.4,  7297.3],
    longTermLeases:           [2373.6, 3114.8,  3560.6,  3182.2,  2866.7],
    pensionOPEB:              [106.6,  99.9,    91.2,    84.7,    58.1],
    deferredTaxLiability:     [1032.5, 1064.3,  1430.2,  1802.9,  1884.5],
    otherNonCurrentLiabilities:[1250.0,2317.3,  1484.8,  1041.2,  955.1],
    totalLiabilities:         [21303.2,25870.6, 28851.4, 27520.1, 27016.8],
    commonEquity:             [10676.3,16871.4, 13375.3, 8727.9,  7180.9], // share capital
    retainedEarnings:         [5634.3, 4673.6,  6174.0,  7305.7,  8473.1],
    minorityInterest:         [372.2,  388.5,   391.5,   406.7,   413.8],
    totalEquity:              [16278.1,22800.4, 20249.8, 16744.6, 16070.0],
    bookValueOfEquity:        [15905.9,22411.9, 19858.3, 16337.9, 15656.2], // total common equity
  },
  cashFlow: {
    dandA:              [2075.9, 1927.6, 2004.9, 2109.6, 2308.2],
    capex:              [-2695.5,-3048.7,-1605.6,-1231.3,-1768.0],
    commonDividendsPaid:[0.0,    0.0,    -297.1, -1130.2,-1428.8],
    changeReceivables:  [225.8, -385.3,  422.1,  -177.7, 168.8],
    changeInventory:    [-13.1,  0.5,    -46.1,  -47.8,  -88.1],
    changePayables:     [-2621.5,485.3,  1191.4, 117.8,  70.2],
    changeUnearnedRev:  [-1271.3,1507.6, 2464.2, 243.5,  52.6],
    changeOtherNWC:     [256.0, -89.4,   5.0,    -98.7,  144.6],
  },
};
```
## 6.2 Market data (as of ~9 Mar 2026)  — `MarketData`
```ts
export const SIA_MARKET: MarketData = {
  currentPrice: 6.49, sharesOutstanding: 3151.9,
  week52High: 7.63, week52Low: 6.21,
  marketValueOfDebt: 9510.7, cash: 8257.1, currency: "SGD",
};
```
(Note: `E = 6.49 * 3151.9 = 20455.831` used for WACC weights; MV of debt 9510.7; total capital
29966.531.)
## 6.3 Forecast assumptions (editable inputs; Base drives the reference outputs)
```ts
export const SIA_ASSUMPTIONS = {
  scenario: "Base",
  revenueGrowth: { bear:[0.01,0.02,0.02,0.01,0.01], base:[0.02,0.03,0.03,0.02,0.02], bull:[0.03,0.04,0.04,0.03,0.03] },
  cogsPctRev:    { bear:[0.65,0.69,0.69,0.65,0.65], base:[0.67,0.71,0.71,0.67,0.67], bull:[0.68,0.72,0.72,0.68,0.68] },
  sgaPctRev:     { bear:0.03, base:0.04, bull:0.05 },
  otherOpExPctRev:{ bear:0.06, base:0.07, bull:0.08 },
  capex:         [-3500, -4700, -4100, -3800, -3000],   // direct inputs, FY26..FY30
  taxRate: 0.17,
  // WACC inputs
  riskFreeRate: 0.0197,   // 10Y SG Gov Bond
  marketRiskPremium: 0.0783, // BBG SG ERP
  preTaxCostOfDebt: 0.041,
  // terminal values
  dcfTerminalGrowth: 0.015,
  ddmTerminalGrowth: 0.015,
  // DDM
  ddmPayoutRatio: 0.4684,           // = average of FY24 (0.4225) and FY25 (0.5143)
  specialDPS: [0.10, 0.10, 0.10, 0.0, 0.0], // FY26..FY30, x sharesOutstanding
};
```
Forecast drivers these assumptions must reproduce (FY2026→FY2030), used as the DCF FCFF inputs:
```ts
export const SIA_FORECAST_DRIVERS = {          // SGD m, FY2026..FY2030
  ebit:      [2120.20, 1225.70, 1086.90, 1952.06, 1946.53],
  dandA:     [2353.55, 2480.78, 2727.06, 2879.43, 2981.59],
  capex:     [-3500,   -4700,   -4100,   -3800,   -3000],
  changeNWC: [243.02,  575.12,  285.93,  -118.57, 200.55],
  fcff:      [856.34,  -626.76, -184.89, 581.07,  1797.77],  // = ebit*(1-0.17)+dandA+capex+changeNWC
  ebitda:    [4473.75, 3706.48, 3813.96, 4831.49, 4928.12],
  terminalEBITDA: 4928.12, terminalEBITDAMargin: 0.2238,
};
```
## 6.4 Beta peers (Hamada) — `PeerData` subset used for beta
Peer equity values/debt already converted to SGD m. Average asset beta and relevered SIA beta are
the anchors; the per-peer asset betas below are the model's own (the average may exclude an
outlier — reproduce the average of **0.4805** and confirm the exclusion rule against my sheet).
```ts
export const SIA_BETA_PEERS = [
  { name:"Cathay Pacific", equityBeta5Y:0.38, equityValue:13002.44, totalDebt:9456.16,  marginalTaxRate:0.165, assetBeta:0.2364 },
  { name:"Qantas",         equityBeta5Y:0.60, equityValue:11544.19, totalDebt:8241.0,   marginalTaxRate:0.300, assetBeta:0.4001 },
  { name:"Air France",     equityBeta5Y:1.29, equityValue:2655.10,  totalDebt:22823.22, marginalTaxRate:0.2583,assetBeta:1.1875 }, // likely outlier
  { name:"Lufthansa",      equityBeta5Y:1.23, equityValue:11544.19, totalDebt:20921.04, marginalTaxRate:0.2993,assetBeta:0.5419 },
  { name:"ANA",            equityBeta5Y:0.49, equityValue:11144.64, totalDebt:9506.35,  marginalTaxRate:0.2974,assetBeta:0.3064 },
  { name:"Korean Air",     equityBeta5Y:0.90, equityValue:7114.20,  totalDebt:18369.40, marginalTaxRate:0.264, assetBeta:0.3103 },
  { name:"Japan Airlines", equityBeta5Y:0.46, equityValue:9165.46,  totalDebt:6933.18,  marginalTaxRate:0.2974,assetBeta:0.3004 },
];
// SIA relever inputs: D/E = 0.5174, taxRate = 0.17 -> targetEquityBeta = 0.6868 (given avgAssetBeta 0.4805)
```
## 6.5 Comps peers (multiples) — 4-peer set
```ts
export const SIA_COMPS_PEERS = [ // SGD m unless noted
  { name:"Cathay Pacific", ticker:"SEHK:293",     price:2.0192,  shares:6439.4, cashSTI:7990,     totalDebt:59101,    sales:18682.56, ebitda:3645.6,  ebit:2314.88, earnings:1732.48, bookValue:9617.6,  fx:0.16,   ntmPE:null, ntmEvEbitda:null },
  { name:"ANA",            ticker:"TSE:9202",     price:23.712,  shares:470.0,  cashSTI:1229950,  totalDebt:1188294,  sales:19491.65, ebitda:2959.82, ebit:1646.35, earnings:1281.56, bookValue:11523.33,fx:0.008,  ntmPE:null, ntmEvEbitda:null },
  { name:"Korean Air",     ticker:"KOSE:A003490", price:19.264,  shares:369.3,  cashSTI:5420941.2,totalDebt:22488055.6,sales:21693.97,ebitda:3412.87, ebit:957.43,  earnings:556.65,  bookValue:9420.47, fx:0.0009, ntmPE:null, ntmEvEbitda:null },
  { name:"Japan Airlines", ticker:"TSE:9201",     price:20.988,  shares:436.6,  cashSTI:915058,   totalDebt:866647,   sales:15990.58, ebitda:2909.32, ebit:1601.24, earnings:1098.18, bookValue:9786.10, fx:0.008,  ntmPE:null, ntmEvEbitda:null },
];
// SIA target metrics for comps:
// LTM: EBITDA 4124.5, earnings 2778.0, BV of equity 15656.2, total debt 9510.7, cash 8257.1
// NTM: EBITDA 4473.75, earnings 1785.41, total debt 9613.10, cash 8405.14
```
## 6.6 Sensitivity grid axes
- DCF Gordon: WACC rows [0.041, 0.051, 0.061, 0.071, 0.081] (center 0.061) × TGR cols
  [0.005, 0.010, 0.015, 0.020, 0.025] (center 0.015).
- DCF exit multiple: WACC × terminal EBITDA margin [0.2038, 0.2138, 0.2238, 0.2338, 0.2438]
  (center 0.2238). (Excel also runs WACC × exit multiple [2.7454..6.7454 step 1.0], center 4.7454.)
- DDM: COE rows [0.0535, 0.0635, 0.0735, 0.0835, 0.0935] (center 0.0735) × TGR cols
  [0.005..0.025 step 0.005] (center 0.015).
## 6.7 REFERENCE OUTPUTS — assert these in tests (tolerance ±0.5% or ±$0.02)
WACC build:
- Cost of equity Ke = **7.35%**; after-tax cost of debt = **3.4%**; WACC = **6.1%**.
- Relevered equity beta = **0.6868**; average peer asset beta = **0.4805**.
DCF (mid-year; FCFF stream in 6.3):
- Sum PV of FCFF = **1948.25**.
- Gordon Growth: TV 39704.35 → PV 30422.60 → EV 32370.85 → equity 31117.25 → **implied $9.8725**.
- Exit multiple (4.7454x × 4928.12 EBITDA): TV 23385.89 → PV 17918.93 → EV 19867.19 →
  equity 18613.59 → **implied $5.9055**; upside vs $6.49 = **−9.0%**. (This is the target price.)
DDM:
- PV of dividends 2691.10 + PV of TV 9498.67 = equity 12189.77 → **implied $3.8674**.
Comparable companies — implied price ranges (football-field values):
- LTM EV/EBITDA: min **3.7089**, mean **5.9166**, max **8.1244** (median multiple 4.7454x).
- LTM P/B: min **3.7512**, mean **5.2333**, max **6.7154**.
- NTM EV/EBITDA: min **3.9317**, mean **6.4582**, max **8.9847**.
- (LTM P/E for reference: min 6.61, median 7.51, max 11.26.)
Football field (Min / Mean / Max, with current $6.49 and target $5.9055 overlaid):
1. DCF Gordon 9.8725 (point)  2. DCF exit 5.9055 (point)  3. LTM EV/EBITDA 3.71/5.92/8.12
4. LTM P/B 3.75/5.23/6.72  5. NTM EV/EBITDA 3.93/6.46/8.98  6. DDM 3.8674 (point)
7. 52-week 6.21/6.92/7.63.
## 6.8 Test strategy (two tiers)
- **Tier 1 — valuation math (exact):** feed the engine the documented WACC inputs + `SIA_FORECAST_DRIVERS`
  FCFF stream + DDM inputs + peer/comps tables, and assert every reference number in 6.7 to the
  cent. This proves §2.3–§2.7 independently of the forecast.
- **Tier 2 — forecast layer (tolerance):** feed `SIA_FINANCIALS` + `SIA_ASSUMPTIONS` and assert the
  engine reproduces `SIA_FORECAST_DRIVERS` (EBIT/D&A/ΔNWC/EBITDA) within tolerance; the exact
  working-capital days convention is a known nuance — calibrate to hit the documented balances and
  document the convention chosen.
- **Adapter round-trip:** hand-built `ExtractionResult[]` for SIA → adapter → `FinancialStatements`
  that equals `SIA_FINANCIALS`. One test proves the whole Bot 1 → Bot 2 seam.
---
# PART 7 — Deliverables & initial commit
1. Monorepo + `contract` (both schemas), README documenting the two-way contract, `DEPLOY.md`.
2. Bot 1 extraction pipeline + `EXTRACTION_PROMPT.md` + tie-out validation, output validated
   against `ExtractionResult`.
3. Bot 2 `core` engine + `app` UI (search → assumptions panel → statements → beta/WACC → four
   valuations → sensitivity heatmaps → football field), `FixtureProvider` (Part 6 data) +
   `ExtractionProvider`.
4. Adapter + all three test tiers reproducing the SIA reference outputs.
5. Initial commit pushed to `keith2929/valuation-bot` (create the empty remote first; if
   `git push` fails on auth, stop and report rather than guessing credentials):
```bash
git init && git add . && git commit -m "Initial commit: SGX extraction + valuation monorepo with SIA fixture"
git branch -M main
git remote add origin https://github.com/keith2929/valuation-bot.git
git push -u origin main
```
