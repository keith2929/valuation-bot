// SIA adapter round-trip fixture (masterprompt2.md §6.8 "Adapter round-trip").
//
// This is the single test that proves the whole Bot 1 → Bot 2 seam: hand-built
// SGX-shaped `ExtractionResult[]` for Singapore Airlines → `toFinancialStatements`
// → the multi-year `FinancialStatements` of §6.1 (`SIA_FINANCIALS`).
//
// Everything lives inside the `adapter` package so the test has NO cross-package
// relative import (the previous version reached into `valuation-creator/core` and
// imported the adapter by a `../../../adapter/src/...` path). `SIA_FINANCIALS` is
// transcribed VERBATIM from §6.1 below rather than imported from
// `valuation-creator`, because `valuation-creator` already depends on the adapter
// (via `ExtractionProvider`) and importing it back here would be circular.
//
// ── Units / shape ────────────────────────────────────────────────────────────
// All monetary figures are in SGD millions. The extraction convention (Part 1)
// is ABSOLUTE units with the scale recorded in `unit_multiplier`; SIA reports in
// SGD millions, so `unit_multiplier` is 1_000_000 and the values below are the
// millions as printed (the adapter does not rescale — it only asserts the
// multiplier/currency are consistent).
//
// ── Why ΔNWC is DERIVED, not round-tripped ───────────────────────────────────
// The adapter (Part 3(d)) derives the working-capital movements
// (`changeReceivables`, `changeInventory`, `changePayables`, `changeUnearnedRev`,
// `changeOtherNWC`) as year-over-year differences of the mapped balance-sheet
// items — deliberately NOT from any cash-flow line. §6.1's own `cashFlow.change*`
// figures are the as-reported cash-flow-statement movements, which differ from
// the balance-sheet deltas (reclassifications, FX, disposals) and, crucially,
// carry a nonzero FY2021 value that a yoy derivation over FY2021–FY2025 can never
// produce (the opening year has no prior period). So the round-trip reproduces
// every field the adapter MAPS — the full income statement, the full balance
// sheet, and cash-flow D&A / capex / dividends — exactly equal to §6.1, and the
// ΔNWC lines below are the adapter's derived values, computed here with the same
// arithmetic the adapter uses so the comparison is exact.

import type {
  ExtractionLine,
  ExtractionResult,
  FinancialStatements,
} from "@valuation-bot/contract";

// ── §6.1 reference (verbatim) ────────────────────────────────────────────────
/**
 * The reproduction target, transcribed verbatim from masterprompt2.md §6.1.
 * The adapter must reproduce every mapped field of this object from the
 * hand-built reports below; the derived ΔNWC lines (`cashFlow.change*`) are the
 * one exception documented in the module header.
 */
export const SIA_FINANCIALS: FinancialStatements = {
  fiscalYears: ["2021", "2022", "2023", "2024", "2025"],
  currency: "SGD",
  incomeStatement: {
    revenue:          [3815.9, 7614.8, 17774.8, 19012.7, 19539.8],
    cogs:             [3551.8, 5391.3, 11143.0, 12366.3, 13292.1],
    sga:              [-1.0,   238.7,  814.4,   809.0,   830.5],
    dandA:            [2075.9, 1927.6, 2004.9,  2109.6,  2308.2],
    otherOpEx:        [631.9,  595.9,  1018.4,  895.0,   1292.7],
    ebit:             [-2508.5, -610.7, 2718.5, 2756.6,  1743.5],
    interestExpense:  [-264.7, -386.8, -416.2,  -418.1,  -389.9],
    interestIncome:   [43.8,   49.9,   416.6,   631.7,   494.1],
    incomeTaxExpense: [-673.8, -141.9, 473.5,   342.0,   152.6],
    netIncome:        [-4270.7, -962.0, 2156.8, 2674.8,  2778.0],
    minorityInterest: [12.7,  -13.9,  -6.5,    -20.3,   -34.2],
  },
  balanceSheet: {
    cash:                     [7783.0, 13762.7, 16327.6, 11256.0, 8257.1],
    shortTermInvestments:     [292.7,  424.5,   426.4,   1315.4,  965.1],
    receivables:              [1035.9, 1750.8,  1524.7,  1865.9,  1593.6],
    inventory:                [194.9,  187.4,   227.0,   268.0,   344.9],
    prepaid:                  [80.7,   93.2,    105.0,   153.9,   109.9],
    otherCurrentAssets:       [284.8,  1464.0,  607.4,   706.5,   91.9],
    netPPE:                   [19811.5, 19637.4, 19258.7, 20390.2, 21207.5],
    longTermInvestments:      [1189.3, 1241.6,  1250.6,  1285.7,  4666.1],
    goodwill:                 [14.0,   14.0,    1.6,     6.3,     6.3],
    intangibles:              [230.9,  219.3,   212.8,   214.4,   230.8],
    otherLTAssets:            [6663.6, 9870.6,  9078.2,  6726.4,  5580.1],
    totalAssets:              [37581.3, 48671.0, 49101.2, 44264.7, 43086.8],
    accountsPayable:          [1676.4, 2408.8,  3932.3,  4259.3,  4509.2],
    accrued:                  [71.7,   72.5,    66.2,    57.6,    50.1],
    currentPortionLTDebt:     [1310.8, 844.2,   2547.9,  915.5,   2213.4],
    currentLeases:            [491.4,  567.7,   617.3,   613.0,   536.9],
    taxesPayable:             [95.4,   153.3,   128.1,   68.2,    72.5],
    unearnedRevCurrent:       [1537.2, 3046.2,  5519.2,  5787.4,  5839.8],
    otherCurrentLiabilities:  [530.3,  775.9,   859.9,   970.7,   733.2],
    longTermDebt:             [10827.3, 11405.7, 8613.7, 8737.4,  7297.3],
    longTermLeases:           [2373.6, 3114.8,  3560.6,  3182.2,  2866.7],
    pensionOPEB:              [106.6,  99.9,    91.2,    84.7,    58.1],
    deferredTaxLiability:     [1032.5, 1064.3,  1430.2,  1802.9,  1884.5],
    otherNonCurrentLiabilities: [1250.0, 2317.3, 1484.8, 1041.2,  955.1],
    totalLiabilities:         [21303.2, 25870.6, 28851.4, 27520.1, 27016.8],
    commonEquity:             [10676.3, 16871.4, 13375.3, 8727.9,  7180.9],
    retainedEarnings:         [5634.3, 4673.6,  6174.0,  7305.7,  8473.1],
    minorityInterest:         [372.2,  388.5,   391.5,   406.7,   413.8],
    totalEquity:              [16278.1, 22800.4, 20249.8, 16744.6, 16070.0],
    bookValueOfEquity:        [15905.9, 22411.9, 19858.3, 16337.9, 15656.2],
  },
  cashFlow: {
    dandA:               [2075.9, 1927.6, 2004.9, 2109.6, 2308.2],
    capex:               [-2695.5, -3048.7, -1605.6, -1231.3, -1768.0],
    commonDividendsPaid: [0.0,    0.0,    -297.1, -1130.2, -1428.8],
    // As-reported §6.1 cash-flow movements — retained for documentation only.
    // The adapter DERIVES these from the balance sheet (see module header and
    // `siaExpectedStatements` below), so they are not the round-trip target.
    changeReceivables:   [225.8, -385.3,  422.1,  -177.7, 168.8],
    changeInventory:     [-13.1,  0.5,    -46.1,  -47.8,  -88.1],
    changePayables:      [-2621.5, 485.3, 1191.4, 117.8,  70.2],
    changeUnearnedRev:   [-1271.3, 1507.6, 2464.2, 243.5, 52.6],
    changeOtherNWC:      [256.0, -89.4,   5.0,    -98.7,  144.6],
  },
};

const PERIOD_ENDS = ["2021-03-31", "2022-03-31", "2023-03-31", "2024-03-31", "2025-03-31"];

// ── Derived ΔNWC (mirrors the adapter exactly) ───────────────────────────────
/** Year-over-year first differences; the opening year has no prior, so it is 0. */
function yoy(series: number[]): number[] {
  return series.map((v, i) => (i === 0 ? 0 : v - series[i - 1]!));
}

const bs = SIA_FINANCIALS.balanceSheet;
// "Other NWC" residual, computed with the identical operand order the adapter
// uses so the derived series is bit-for-bit equal:
//   (prepaid + otherCurrentAssets) − (accrued + taxesPayable + otherCurrentLiabilities)
const otherNWC = bs.prepaid.map(
  (_v, i) =>
    bs.prepaid[i]! +
    bs.otherCurrentAssets[i]! -
    (bs.accrued[i]! + bs.taxesPayable[i]! + bs.otherCurrentLiabilities[i]!),
);

/**
 * The FinancialStatements the adapter produces from the reports below: identical
 * to §6.1 `SIA_FINANCIALS` in every mapped field, with the `cashFlow.change*`
 * lines replaced by the adapter's balance-sheet-derived ΔNWC (Part 3(d)).
 */
export const siaExpectedStatements: FinancialStatements = {
  ...SIA_FINANCIALS,
  cashFlow: {
    dandA: SIA_FINANCIALS.cashFlow.dandA,
    capex: SIA_FINANCIALS.cashFlow.capex,
    commonDividendsPaid: SIA_FINANCIALS.cashFlow.commonDividendsPaid,
    changeReceivables: yoy(bs.receivables),
    changeInventory: yoy(bs.inventory),
    changePayables: yoy(bs.accountsPayable),
    changeUnearnedRev: yoy(bs.unearnedRevCurrent),
    changeOtherNWC: yoy(otherNWC),
  },
};

// ── Projection: §6.1 timeline → overlapping annual reports ────────────────────
// Each canonical tag carries its five-year series (indexed FY2021..FY2025). A
// report for fiscal-year index `c` transcribes column `c` into `value` and the
// prior year `c-1` into `value_comparative`, exactly as a real annual report
// prints a current and a comparative column.

interface TagSeries {
  tag: string;
  label: string;
  series: number[];
}

const is = SIA_FINANCIALS.incomeStatement;
const cf = SIA_FINANCIALS.cashFlow;

// Income-statement tags. `dandA` is carried once as `depreciation_amortization`
// in the cash-flow section below and serves both `incomeStatement.dandA` and
// `cashFlow.dandA` (the adapter pools tags across all three statements).
const INCOME_LINES: TagSeries[] = [
  { tag: "revenue", label: "Total revenue", series: is.revenue },
  { tag: "cost_of_sales", label: "Cost of sales", series: is.cogs },
  { tag: "administrative_expenses", label: "Administrative expenses", series: is.sga },
  { tag: "other_expenses", label: "Other operating expenses", series: is.otherOpEx },
  { tag: "operating_profit", label: "Operating profit/(loss)", series: is.ebit },
  { tag: "finance_costs", label: "Finance costs", series: is.interestExpense },
  { tag: "finance_income", label: "Interest income", series: is.interestIncome },
  { tag: "tax_expense", label: "Taxation", series: is.incomeTaxExpense },
  { tag: "net_profit", label: "Profit/(loss) for the financial year", series: is.netIncome },
  { tag: "profit_attributable_to_nci", label: "Non-controlling interests", series: is.minorityInterest },
];

const BALANCE_LINES: TagSeries[] = [
  { tag: "cash_and_equivalents", label: "Cash and bank balances", series: bs.cash },
  { tag: "short_term_investments", label: "Short-term deposits", series: bs.shortTermInvestments },
  { tag: "trade_receivables", label: "Trade debtors", series: bs.receivables },
  { tag: "inventories", label: "Inventories", series: bs.inventory },
  { tag: "prepaid_expenses", label: "Prepayments", series: bs.prepaid },
  { tag: "other_current_assets", label: "Other current assets", series: bs.otherCurrentAssets },
  { tag: "ppe", label: "Property, plant and equipment", series: bs.netPPE },
  { tag: "long_term_investments", label: "Long-term investments", series: bs.longTermInvestments },
  { tag: "goodwill", label: "Goodwill", series: bs.goodwill },
  { tag: "intangible_assets", label: "Intangible assets", series: bs.intangibles },
  { tag: "other_non_current_assets", label: "Other non-current assets", series: bs.otherLTAssets },
  { tag: "total_assets", label: "Total assets", series: bs.totalAssets },
  { tag: "trade_payables", label: "Trade and other creditors", series: bs.accountsPayable },
  { tag: "accrued_expenses", label: "Accrued expenses", series: bs.accrued },
  { tag: "borrowings_current", label: "Borrowings (current)", series: bs.currentPortionLTDebt },
  { tag: "lease_liabilities_current", label: "Lease liabilities (current)", series: bs.currentLeases },
  { tag: "current_tax_payable", label: "Provision for taxation", series: bs.taxesPayable },
  { tag: "deferred_revenue_current", label: "Advance ticket sales", series: bs.unearnedRevCurrent },
  { tag: "other_current_liabilities", label: "Other current liabilities", series: bs.otherCurrentLiabilities },
  { tag: "borrowings_non_current", label: "Borrowings (non-current)", series: bs.longTermDebt },
  { tag: "lease_liabilities_non_current", label: "Lease liabilities (non-current)", series: bs.longTermLeases },
  { tag: "pension_opeb", label: "Provision for pension", series: bs.pensionOPEB },
  { tag: "deferred_tax_liabilities", label: "Deferred taxation", series: bs.deferredTaxLiability },
  { tag: "other_non_current_liabilities", label: "Other long-term liabilities", series: bs.otherNonCurrentLiabilities },
  { tag: "total_liabilities", label: "Total liabilities", series: bs.totalLiabilities },
  { tag: "share_capital", label: "Share capital", series: bs.commonEquity },
  { tag: "retained_earnings", label: "General reserve", series: bs.retainedEarnings },
  { tag: "non_controlling_interests", label: "Non-controlling interests", series: bs.minorityInterest },
  { tag: "total_equity", label: "Total equity", series: bs.totalEquity },
  { tag: "equity_attributable_to_owners", label: "Equity attributable to owners of the Company", series: bs.bookValueOfEquity },
];

const CASHFLOW_LINES: TagSeries[] = [
  { tag: "depreciation_amortization", label: "Depreciation and amortisation", series: cf.dandA },
  { tag: "capex_purchase_of_ppe", label: "Purchase of property, plant and equipment", series: cf.capex },
  { tag: "dividends_paid", label: "Dividends paid", series: cf.commonDividendsPaid },
];

/** Project one canonical line onto a report whose current column is year `c`. */
function line(spec: TagSeries, c: number): ExtractionLine {
  return {
    tag: spec.tag,
    label: spec.label,
    value: spec.series[c]!,
    value_comparative: c > 0 ? spec.series[c - 1]! : null,
  };
}

/**
 * Build the audited FY annual report whose current column is fiscal-year index
 * `c` and whose comparative column is `c-1`. Untagged lines (fuel cost, an
 * operating KPI) are included in every statement to prove the adapter ignores
 * `tag: null` rows.
 */
function buildReport(c: number): ExtractionResult {
  return {
    company_name: "Singapore Airlines Limited",
    counter_code: "C6L",
    currency: "SGD",
    unit_multiplier: 1_000_000,
    period_end: PERIOD_ENDS[c]!,
    comparative_period_end: PERIOD_ENDS[c - 1]!,
    period_type: "FY",
    consolidated: true,
    audited: true,
    statements: {
      income_statement: [
        { tag: null, label: "Fuel costs", value: -6000, value_comparative: -5000 },
        ...INCOME_LINES.map((s) => line(s, c)),
      ],
      balance_sheet: [
        ...BALANCE_LINES.map((s) => line(s, c)),
        { tag: null, label: "Net asset value per share ($)", value: 5.0, value_comparative: 4.8 },
      ],
      cash_flow: CASHFLOW_LINES.map((s) => line(s, c)),
    },
    extraction_warnings: [],
  };
}

/**
 * Four overlapping audited FY annual reports, newest last, covering FY2021–FY2025:
 *   - FY2022 report: current FY2022, comparative FY2021.
 *   - FY2023 report: current FY2023, comparative FY2022.
 *   - FY2024 report: current FY2024, comparative FY2023.
 *   - FY2025 report: current FY2025, comparative FY2024.
 * FY2022/FY2023/FY2024 are each observed twice (current in one report, comparative
 * in the next) with identical figures, exercising the adapter's overlap stitching
 * without raising a mismatch. FY2021 appears only as a comparative and FY2025 only
 * as a current column.
 */
export const siaExtractionReports: ExtractionResult[] = [
  buildReport(1),
  buildReport(2),
  buildReport(3),
  buildReport(4),
];
