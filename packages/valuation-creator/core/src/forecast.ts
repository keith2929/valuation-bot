// Operating forecast built line by line off a company's historical
// FinancialStatements, feeding the valuation engines (dcf.ts / sensitivity.ts).
//
// See the `buildForecast` section near the end of this file for the composed
// entry point that wires together the schedules below (PP&E/D&A, P&L,
// working capital, debt/interest/net-income, and the closing balance-sheet
// and cash-flow block) into a single full forecast plus a summarised FCFF
// driver schedule.

import type { FinancialStatements } from "@valuation-bot/contract";

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Assumption-derivation helpers
//
// Pure functions that turn a company's historical FinancialStatements (the
// `@valuation-bot/contract` shape) into the percent-of-revenue,
// percent-of-COGS, and days-outstanding driver assumptions consumed by
// `buildForecast` above. Each derived assumption is a trailing average over
// however many of the most recent fiscal years the driver is stable over
// (see `deriveOperatingAssumptions` for the window used per line), so that a
// single unrepresentative year — e.g. a pandemic-year swing — does not by
// itself set the forward-looking assumption.
//
// `deriveOperatingAssumptions` only reads fields that exist on the shared
// `FinancialStatements` contract. `grossPpeToSalesRatio` is a standalone
// helper for the one driver (gross PP&E as a fraction of sales) whose input
// — gross, pre-depreciation PP&E — is not part of that contract; callers
// that have it (e.g. from a source model with a fuller balance sheet) can
// pass it in directly.
// ─────────────────────────────────────────────────────────────────────────

/** Days a balance is outstanding for a single period: line / base * 365. */
export function daysOutstanding(line: number, base: number): number {
  return (line / base) * 365;
}

/** A single period's line as a fraction of its base, e.g. COGS / revenue. */
export function percentOf(line: number, base: number): number {
  return line / base;
}

/** Simple arithmetic mean of a non-empty array. */
export function trailingAverage(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("trailingAverage requires at least one value");
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The most recent `n` entries of `values`. Throws if `n` is out of range. */
function lastN<T>(values: readonly T[], n: number): T[] {
  if (!Number.isInteger(n) || n <= 0 || n > values.length) {
    throw new RangeError(`window of ${n} years is out of range for ${values.length} values`);
  }
  return values.slice(values.length - n);
}

/** Element-wise sum of same-length series, e.g. combining debt sub-lines. */
function sumSeries(...series: readonly (readonly number[])[]): number[] {
  const [first, ...rest] = series;
  if (!first) {
    throw new RangeError("sumSeries requires at least one series");
  }
  return first.map((value, i) => rest.reduce((sum, s) => sum + s[i]!, value));
}

/**
 * Average of consecutive pairs of `values`: for [v0, v1, ..., vn] returns
 * [avg(v0,v1), avg(v1,v2), ..., avg(v_{n-1},v_n)] — one fewer element than
 * the input. Used for ratios expressed against an average (opening plus
 * closing) balance rather than a period-end balance, e.g. interest expense
 * over the average debt balance outstanding during the year.
 */
function averageBalances(values: readonly number[]): number[] {
  if (values.length < 2) {
    throw new RangeError("averageBalances requires at least two values");
  }
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    result.push((values[i - 1]! + values[i]!) / 2);
  }
  return result;
}

/**
 * Trailing `windowYears` average of the per-year `percentOf(line, base)`
 * ratio. `line` and `base` must be the same length and cover the same
 * fiscal years.
 */
export function trailingPercentOf(
  line: readonly number[],
  base: readonly number[],
  windowYears: number,
): number {
  const lineWindow = lastN(line, windowYears);
  const baseWindow = lastN(base, windowYears);
  return trailingAverage(lineWindow.map((value, i) => percentOf(value, baseWindow[i]!)));
}

/**
 * Trailing `windowYears` average of the per-year `daysOutstanding(line,
 * base)` ratio. `line` and `base` must be the same length and cover the
 * same fiscal years.
 */
export function trailingDaysOutstanding(
  line: readonly number[],
  base: readonly number[],
  windowYears: number,
): number {
  const lineWindow = lastN(line, windowYears);
  const baseWindow = lastN(base, windowYears);
  return trailingAverage(lineWindow.map((value, i) => daysOutstanding(value, baseWindow[i]!)));
}

export interface OperatingAssumptions {
  /** COGS / revenue, trailing 4-year average. */
  cogsPctRevenue: number;
  /** SG&A / revenue, trailing 3-year average. */
  sgaPctRevenue: number;
  /** Other operating expenses / revenue, most recent fiscal year. */
  otherOpExPctRevenue: number;
  /** Receivables days outstanding off revenue, trailing 3-year average. */
  receivablesDays: number;
  /** Inventory days outstanding off COGS, trailing 3-year average. */
  inventoryDaysOfCogs: number;
  /** Prepaid expense days outstanding off COGS, trailing 3-year average. */
  prepaidDaysOfCogs: number;
  /** Accounts payable days outstanding off COGS, trailing 3-year average. */
  accountsPayableDaysOfCogs: number;
  /** Accrued liabilities days outstanding off COGS, trailing 3-year average. */
  accruedDaysOfCogs: number;
  /** Unearned (deferred) revenue / revenue, trailing 3-year average. */
  unearnedRevenuePctRevenue: number;
  /**
   * Other current liabilities as a fraction of total current liabilities
   * (accounts payable + accrued + current debt + current leases + taxes
   * payable + unearned revenue + other current liabilities), trailing
   * 3-year average.
   */
  otherCurrentLiabilitiesPctOfTotalCurrentLiabilities: number;
  /** D&A / average(net PPE) over the last two fiscal years. */
  depreciationRateOnNetPPE: number;
  /**
   * Target debt-to-equity: (current portion of LT debt + LT debt) / book
   * value of equity, averaged over every fiscal year in the history.
   */
  targetDebtToEquity: number;
  /**
   * Interest expense over the average (opening + closing) debt balance for
   * the year, trailing 3-year average.
   */
  interestRateOnDebt: number;
  /**
   * Interest income over cash + short-term investments, trailing 3-year
   * average.
   */
  yieldOnCashAndShortTermInvestments: number;
  /**
   * |Common dividends paid| / net income, trailing 2-year average.
   */
  payoutRatio: number;
}

/**
 * Derive the operating, working-capital, and capital-structure assumptions
 * used to build a forward operating forecast from a company's historical
 * `FinancialStatements`. Requires at least 5 fiscal years of history (the
 * widest trailing window used below).
 */
export function deriveOperatingAssumptions(financials: FinancialStatements): OperatingAssumptions {
  if (financials.fiscalYears.length < 5) {
    throw new RangeError(
      `deriveOperatingAssumptions requires at least 5 fiscal years, got ${financials.fiscalYears.length}`,
    );
  }

  const { revenue, cogs, sga, otherOpEx, dandA, interestExpense, interestIncome, netIncome } =
    financials.incomeStatement;
  const {
    receivables,
    inventory,
    prepaid,
    netPPE,
    accountsPayable,
    accrued,
    currentPortionLTDebt,
    currentLeases,
    taxesPayable,
    unearnedRevCurrent,
    otherCurrentLiabilities,
    longTermDebt,
    bookValueOfEquity,
    cash,
    shortTermInvestments,
  } = financials.balanceSheet;
  const { commonDividendsPaid } = financials.cashFlow;

  const totalDebt = sumSeries(currentPortionLTDebt, longTermDebt);
  const totalCurrentLiabilities = sumSeries(
    accountsPayable,
    accrued,
    currentPortionLTDebt,
    currentLeases,
    taxesPayable,
    unearnedRevCurrent,
    otherCurrentLiabilities,
  );
  const cashAndShortTermInvestments = sumSeries(cash, shortTermInvestments);

  const avgDebtBalances = averageBalances(totalDebt);
  const interestRateRatios = lastN(interestExpense, avgDebtBalances.length).map(
    (value, i) => Math.abs(value) / avgDebtBalances[i]!,
  );

  const payoutRatios = lastN(commonDividendsPaid, 2).map(
    (value, i) => Math.abs(value) / lastN(netIncome, 2)[i]!,
  );

  return {
    cogsPctRevenue: trailingPercentOf(cogs, revenue, 4),
    sgaPctRevenue: trailingPercentOf(sga, revenue, 3),
    otherOpExPctRevenue: trailingPercentOf(otherOpEx, revenue, 1),
    receivablesDays: trailingDaysOutstanding(receivables, revenue, 3),
    inventoryDaysOfCogs: trailingDaysOutstanding(inventory, cogs, 3),
    prepaidDaysOfCogs: trailingDaysOutstanding(prepaid, cogs, 3),
    accountsPayableDaysOfCogs: trailingDaysOutstanding(accountsPayable, cogs, 3),
    accruedDaysOfCogs: trailingDaysOutstanding(accrued, cogs, 3),
    unearnedRevenuePctRevenue: trailingPercentOf(unearnedRevCurrent, revenue, 3),
    otherCurrentLiabilitiesPctOfTotalCurrentLiabilities: trailingPercentOf(
      otherCurrentLiabilities,
      totalCurrentLiabilities,
      3,
    ),
    depreciationRateOnNetPPE: dandA[dandA.length - 1]! / trailingAverage(lastN(netPPE, 2)),
    targetDebtToEquity: trailingPercentOf(totalDebt, bookValueOfEquity, totalDebt.length),
    interestRateOnDebt: trailingAverage(lastN(interestRateRatios, 3)),
    yieldOnCashAndShortTermInvestments: trailingPercentOf(interestIncome, cashAndShortTermInvestments, 3),
    payoutRatio: trailingAverage(payoutRatios),
  };
}

/**
 * Gross PP&E (pre-depreciation) as a fraction of sales: the average of the
 * last two fiscal years' gross PP&E over the most recent fiscal year's
 * revenue. Not derivable from the `FinancialStatements` contract (which
 * carries only net PPE), so gross PP&E is a caller-supplied series aligned
 * to the same fiscal years as `revenue`.
 */
export function grossPpeToSalesRatio(
  grossPPE: readonly number[],
  revenue: readonly number[],
): number {
  const latestRevenue = revenue[revenue.length - 1];
  if (latestRevenue === undefined) {
    throw new RangeError("grossPpeToSalesRatio requires at least one revenue value");
  }
  return trailingAverage(lastN(grossPPE, 2)) / latestRevenue;
}

// ─────────────────────────────────────────────────────────────────────────
// PP&E and D&A schedule
//
// A capex-driven rollforward of net property, plant & equipment, run
// independently of the income-statement forecast below:
//
//   begNetPPE_1 = base net PPE (last actual year's ending balance)
//   D&A_t       = begNetPPE_t * depreciationRateOnNetPPE   (BEGINNING balance,
//                                                            not average)
//   endNetPPE_t = begNetPPE_t + capex_t - D&A_t
//   grossPPE_t  = grossPpeToSalesRatio * revenue_t   (display only; does not
//                                                      feed endNetPPE)
//
// capex_t is a direct per-year input (a positive spend), not derived from
// revenue. `depreciationRateOnNetPPE` and `grossPpeToSalesRatio` are the
// same-named driver values produced by `deriveOperatingAssumptions` /
// `grossPpeToSalesRatio` above.
// ─────────────────────────────────────────────────────────────────────────

export interface PpeScheduleYearInput {
  /** Capital expenditure for the year, as a positive spend; must be >= 0. */
  capitalExpenditure: number;
  /** Revenue for the year; used only for the display-only gross PPE line. */
  revenue: number;
}

export interface PpeScheduleInput {
  /** Net PPE at the end of the last actual year; anchors year 1's beginning balance. */
  baseNetPPE: number;
  /** D&A as a fraction of the *beginning* net PPE balance; must be >= 0. */
  depreciationRateOnNetPPE: number;
  /** Gross PPE as a fraction of revenue, for the display-only gross PPE line; must be >= 0. */
  grossPpeToSalesRatio: number;
  /** Per-year capex/revenue inputs for years 1..N; must be non-empty. */
  years: readonly PpeScheduleYearInput[];
}

export interface PpeScheduleYear {
  /** 1-based forecast year. */
  year: number;
  /** Net PPE at the start of the year (prior year's ending balance). */
  beginningNetPPE: number;
  /** beginningNetPPE * depreciationRateOnNetPPE. */
  depreciationAndAmortisation: number;
  /** Capital expenditure for the year, as a positive spend. */
  capitalExpenditure: number;
  /** beginningNetPPE + capitalExpenditure - depreciationAndAmortisation. */
  endingNetPPE: number;
  /** grossPpeToSalesRatio * revenue; display only, does not feed endingNetPPE. */
  grossPPE: number;
}

export interface PpeScheduleResult {
  /** Full per-year schedule for years 1..N. */
  years: PpeScheduleYear[];
}

/**
 * Build the capex-driven net PP&E and D&A rollforward for years 1..N (see
 * the module header for the line-by-line derivation).
 *
 * Throws RangeError if `years` is empty or any input is out of range.
 */
export function buildPpeSchedule(input: PpeScheduleInput): PpeScheduleResult {
  assertFinite(input.baseNetPPE, "baseNetPPE");
  if (input.baseNetPPE <= 0) {
    throw new RangeError(`baseNetPPE must be > 0, got ${input.baseNetPPE}`);
  }
  assertFinite(input.depreciationRateOnNetPPE, "depreciationRateOnNetPPE");
  if (input.depreciationRateOnNetPPE < 0) {
    throw new RangeError(
      `depreciationRateOnNetPPE must be >= 0, got ${input.depreciationRateOnNetPPE}`,
    );
  }
  assertFinite(input.grossPpeToSalesRatio, "grossPpeToSalesRatio");
  if (input.grossPpeToSalesRatio < 0) {
    throw new RangeError(`grossPpeToSalesRatio must be >= 0, got ${input.grossPpeToSalesRatio}`);
  }
  if (input.years.length === 0) {
    throw new RangeError("years must contain at least one forecast year");
  }

  let beginningNetPPE = input.baseNetPPE;

  const years: PpeScheduleYear[] = input.years.map((yearInput, i) => {
    const label = `years[${i}]`;
    assertFinite(yearInput.capitalExpenditure, `${label}.capitalExpenditure`);
    if (yearInput.capitalExpenditure < 0) {
      throw new RangeError(
        `${label}.capitalExpenditure must be >= 0, got ${yearInput.capitalExpenditure}`,
      );
    }
    assertFinite(yearInput.revenue, `${label}.revenue`);

    const depreciationAndAmortisation = beginningNetPPE * input.depreciationRateOnNetPPE;
    const endingNetPPE =
      beginningNetPPE + yearInput.capitalExpenditure - depreciationAndAmortisation;
    const grossPPE = input.grossPpeToSalesRatio * yearInput.revenue;

    const row: PpeScheduleYear = {
      year: i + 1,
      beginningNetPPE,
      depreciationAndAmortisation,
      capitalExpenditure: yearInput.capitalExpenditure,
      endingNetPPE,
      grossPPE,
    };

    beginningNetPPE = endingNetPPE;
    return row;
  });

  return { years };
}

// ─────────────────────────────────────────────────────────────────────────
// Income statement (P&L) forecast with a Bear/Base/Bull scenario toggle
//
// A line-by-line rebuild of the Excel "3FS" sheet's income-statement
// forecast, down to EBIT/EBITDA, driven off explicit COGS/SG&A/other-opex
// percent-of-revenue assumptions:
//
//   revenue_t   = revenue_{t-1} * (1 + revenueGrowth_t)
//   cogs_t      = revenue_t * cogsPctRevenue_t
//   sga_t       = revenue_t * sgaPctRevenue
//   otherOpEx_t = revenue_t * otherOpExPctRevenue
//   dAndA_t     = supplied directly (from `buildPpeSchedule`; scenario-independent)
//   amortOfGoodwillIntangibles = 0 (Excel forecasts none forward)
//   ebit_t      = revenue_t - cogs_t - (sga_t + dAndA_t + otherOpEx_t)
//   ebitda_t    = ebit_t + dAndA_t
//
// The scenario toggle mirrors the Excel's `CHOOSE($D$3, bear, base, bull)`
// cells: each driver's Bear/Bull value is the Base value plus a fixed
// offset (revenue growth and SG&A/other-opex are offset symmetrically;
// COGS is offset asymmetrically per the source model — see
// `DEFAULT_SCENARIO_OFFSETS`). SG&A and other-opex percentages are held
// constant across the forecast window (the Excel repeats the same
// trailing-average cell across years), so they are single numbers rather
// than per-year arrays.
// ─────────────────────────────────────────────────────────────────────────

/** Bear / Base / Bull scenario selector, mirroring the Excel's CHOOSE($D$3, ...) toggle. */
export type Scenario = "bear" | "base" | "bull";

/** Pick a scenario's value, Excel `CHOOSE($D$3, bear, base, bull)` semantics. */
function chooseScenario(scenario: Scenario, bear: number, base: number, bull: number): number {
  switch (scenario) {
    case "bear":
      return bear;
    case "base":
      return base;
    case "bull":
      return bull;
  }
}

/**
 * Fixed offsets applied to each driver's Base value to derive its Bear/Bull
 * value, taken from the source Excel model. COGS is asymmetric (Bear is
 * *lower* than Base, reflecting the source model's own scenario framing);
 * every other driver is offset symmetrically by ±1%.
 */
export const DEFAULT_SCENARIO_OFFSETS = {
  revenueGrowth: 0.01,
  cogsPctRevenueBear: -0.02,
  cogsPctRevenueBull: 0.01,
  sgaPctRevenue: 0.01,
  otherOpExPctRevenue: 0.01,
} as const;

export interface IncomeStatementYearInput {
  /** Base-case year-over-year revenue growth as a decimal; must be > -1. */
  revenueGrowthBase: number;
  /** Base-case COGS as a fraction of revenue for the year. */
  cogsPctRevenueBase: number;
  /**
   * Depreciation & amortisation for the year, in the same currency units as
   * revenue — normally `buildPpeSchedule(...).years[i].depreciationAndAmortisation`.
   * Scenario-independent (the PP&E schedule does not vary by scenario).
   */
  depreciationAndAmortisation: number;
}

export interface IncomeStatementForecastInput {
  /** Which of the three scenarios to compute. */
  scenario: Scenario;
  /** Revenue of the last actual (historical) year; must be > 0. */
  baseRevenue: number;
  /** Base-case SG&A as a fraction of revenue; held constant across all forecast years. */
  sgaPctRevenueBase: number;
  /** Base-case other operating expense as a fraction of revenue; held constant across all forecast years. */
  otherOpExPctRevenueBase: number;
  /** Per-year revenue-growth/COGS% base assumptions and PP&E-schedule D&A; must be non-empty. */
  years: readonly IncomeStatementYearInput[];
  /** Scenario offsets; defaults to `DEFAULT_SCENARIO_OFFSETS`. */
  offsets?: Partial<typeof DEFAULT_SCENARIO_OFFSETS>;
}

export interface IncomeStatementYear {
  /** 1-based forecast year. */
  year: number;
  /** revenue_{t-1} * (1 + revenueGrowth_t), revenueGrowth_t per the scenario. */
  revenue: number;
  /** revenue * cogsPctRevenue_t, cogsPctRevenue_t per the scenario. */
  cogs: number;
  /** revenue * sgaPctRevenue, sgaPctRevenue per the scenario. */
  sga: number;
  /** revenue * otherOpExPctRevenue, otherOpExPctRevenue per the scenario. */
  otherOpEx: number;
  /** As supplied on the corresponding `IncomeStatementYearInput`. */
  depreciationAndAmortisation: number;
  /** Always 0 — the Excel forecasts no forward goodwill/intangible amortisation. */
  amortOfGoodwillIntangibles: number;
  /** revenue - cogs - (sga + depreciationAndAmortisation + otherOpEx). */
  ebit: number;
  /** ebit + depreciationAndAmortisation. */
  ebitda: number;
}

export interface IncomeStatementForecastResult {
  /** Full per-year schedule for years 1..N. */
  years: IncomeStatementYear[];
}

/**
 * Build the income-statement forecast down to EBIT/EBITDA for years 1..N
 * under the given Bear/Base/Bull scenario (see the module header for the
 * line-by-line derivation).
 *
 * Throws RangeError if `years` is empty or any input is out of range.
 */
export function buildIncomeStatementForecast(
  input: IncomeStatementForecastInput,
): IncomeStatementForecastResult {
  assertFinite(input.baseRevenue, "baseRevenue");
  if (input.baseRevenue <= 0) {
    throw new RangeError(`baseRevenue must be > 0, got ${input.baseRevenue}`);
  }
  assertFinite(input.sgaPctRevenueBase, "sgaPctRevenueBase");
  assertFinite(input.otherOpExPctRevenueBase, "otherOpExPctRevenueBase");
  if (input.years.length === 0) {
    throw new RangeError("years must contain at least one forecast year");
  }

  const offsets = { ...DEFAULT_SCENARIO_OFFSETS, ...input.offsets };

  const sgaPctRevenue = chooseScenario(
    input.scenario,
    input.sgaPctRevenueBase - offsets.sgaPctRevenue,
    input.sgaPctRevenueBase,
    input.sgaPctRevenueBase + offsets.sgaPctRevenue,
  );
  const otherOpExPctRevenue = chooseScenario(
    input.scenario,
    input.otherOpExPctRevenueBase - offsets.otherOpExPctRevenue,
    input.otherOpExPctRevenueBase,
    input.otherOpExPctRevenueBase + offsets.otherOpExPctRevenue,
  );

  let revenue = input.baseRevenue;

  const years: IncomeStatementYear[] = input.years.map((yearInput, i) => {
    const label = `years[${i}]`;
    assertFinite(yearInput.revenueGrowthBase, `${label}.revenueGrowthBase`);
    if (yearInput.revenueGrowthBase <= -1) {
      throw new RangeError(
        `${label}.revenueGrowthBase must be > -1, got ${yearInput.revenueGrowthBase}`,
      );
    }
    assertFinite(yearInput.cogsPctRevenueBase, `${label}.cogsPctRevenueBase`);
    assertFinite(
      yearInput.depreciationAndAmortisation,
      `${label}.depreciationAndAmortisation`,
    );

    const revenueGrowth = chooseScenario(
      input.scenario,
      yearInput.revenueGrowthBase - offsets.revenueGrowth,
      yearInput.revenueGrowthBase,
      yearInput.revenueGrowthBase + offsets.revenueGrowth,
    );
    revenue = revenue * (1 + revenueGrowth);

    const cogsPctRevenue = chooseScenario(
      input.scenario,
      yearInput.cogsPctRevenueBase + offsets.cogsPctRevenueBear,
      yearInput.cogsPctRevenueBase,
      yearInput.cogsPctRevenueBase + offsets.cogsPctRevenueBull,
    );

    const cogs = revenue * cogsPctRevenue;
    const sga = revenue * sgaPctRevenue;
    const otherOpEx = revenue * otherOpExPctRevenue;
    const depreciationAndAmortisation = yearInput.depreciationAndAmortisation;
    const amortOfGoodwillIntangibles = 0;
    const ebit = revenue - cogs - (sga + depreciationAndAmortisation + otherOpEx);
    const ebitda = ebit + depreciationAndAmortisation;

    return {
      year: i + 1,
      revenue,
      cogs,
      sga,
      otherOpEx,
      depreciationAndAmortisation,
      amortOfGoodwillIntangibles,
      ebit,
      ebitda,
    };
  });

  return { years };
}

// ─────────────────────────────────────────────────────────────────────────
// Working-capital schedule
//
// A days-outstanding / percent-of-revenue driven rollforward of net working
// capital, reproducing the source Excel "3FS" sheet's working-capital
// section. Each current-asset/liability line is driven off revenue or COGS;
// `otherCurrentAssets`, `currentLeases`, and `taxesPayable` are held flat at
// their last actual (FY25) level, and `currentPortionLTDebt` is 0 in every
// forecast year:
//
//   receivables_t = receivablesDays/365 * revenue_t
//   inventory_t   = inventoryDaysOfCogs/365 * cogs_t
//   prepaid_t     = prepaidDaysOfCogs/365 * cogs_t
//   otherCA_t     = otherCurrentAssets            (flat)
//   AP_t          = accountsPayableDaysOfCogs/365 * cogs_t
//   accrued_t     = accruedDaysOfCogs/365 * cogs_t
//   unearnedRev_t = unearnedRevenuePctRevenue * revenue_t
//
// `otherCurrentLiabilities` (OCL) is circular in the source model: it is
// defined as a fixed ratio `r` of TOTAL current liabilities, which itself
// includes OCL. Solving algebraically for the fixed point (currentPortionLTDebt
// drops out of the solve because it is 0 in every forecast year):
//
//   OCL_t = r * (AP_t + accrued_t + currentLeases + taxesPayable + unearnedRev_t) / (1 - r)
//
// Then:
//
//   NWC_t       = (receivables_t + inventory_t + prepaid_t + otherCA_t)
//                 - (AP_t + accrued_t + unearnedRev_t + OCL_t)
//   changeNWC_t = NWC_{t-1} - NWC_t     (positive = cash release; NWC_0 = openingNetWorkingCapital)
//
// Note NWC/changeNWC deliberately exclude currentLeases and taxesPayable —
// those feed only the OCL solve's total-current-liabilities denominator,
// same set of lines `deriveOperatingAssumptions` sums for its own
// `totalCurrentLiabilities`, but excluded from the working-capital level
// itself as debt-like items. Also note the sign of `changeNWC` here (prior
// minus current, positive = cash release) is the convention the composed
// `buildForecast`'s `ForecastDrivers.changeNWC` and FCFF line reuse
// directly — this schedule mirrors the source Excel, where a shrinking
// (more negative) NWC shows as a positive cash inflow.
// ─────────────────────────────────────────────────────────────────────────

export interface WorkingCapitalScheduleYearInput {
  /** Revenue for the year; drives receivables and unearned revenue. */
  revenue: number;
  /** COGS for the year; drives inventory, prepaid, accounts payable, and accrued. */
  cogs: number;
}

export interface WorkingCapitalScheduleInput {
  /** Net working capital level at the end of the last actual year (FY25); anchors year 1's change. */
  openingNetWorkingCapital: number;
  /** Receivables days outstanding off revenue. */
  receivablesDays: number;
  /** Inventory days outstanding off COGS. */
  inventoryDaysOfCogs: number;
  /** Prepaid expense days outstanding off COGS. */
  prepaidDaysOfCogs: number;
  /** Other current assets, held flat at the last actual (FY25) level across all forecast years. */
  otherCurrentAssets: number;
  /** Accounts payable days outstanding off COGS. */
  accountsPayableDaysOfCogs: number;
  /** Accrued liabilities days outstanding off COGS. */
  accruedDaysOfCogs: number;
  /** Unearned (deferred) revenue as a fraction of revenue. */
  unearnedRevenuePctRevenue: number;
  /**
   * Other current liabilities as a fraction of total current liabilities
   * (which includes other current liabilities itself, hence the algebraic
   * solve); must be in [0, 1).
   */
  otherCurrentLiabilitiesPctOfTotalCurrentLiabilities: number;
  /** Current portion of operating leases, held flat at the last actual (FY25) level; feeds only the OCL solve. */
  currentLeases: number;
  /** Taxes payable, held flat at the last actual (FY25) level; feeds only the OCL solve. */
  taxesPayable: number;
  /** Per-year revenue/COGS inputs for years 1..N; must be non-empty. */
  years: readonly WorkingCapitalScheduleYearInput[];
}

export interface WorkingCapitalScheduleYear {
  /** 1-based forecast year. */
  year: number;
  /** receivablesDays/365 * revenue. */
  receivables: number;
  /** inventoryDaysOfCogs/365 * cogs. */
  inventory: number;
  /** prepaidDaysOfCogs/365 * cogs. */
  prepaid: number;
  /** Held flat at the input's otherCurrentAssets level. */
  otherCurrentAssets: number;
  /** accountsPayableDaysOfCogs/365 * cogs. */
  accountsPayable: number;
  /** accruedDaysOfCogs/365 * cogs. */
  accrued: number;
  /** unearnedRevenuePctRevenue * revenue. */
  unearnedRevenue: number;
  /** Solved algebraically so that otherCurrentLiabilities = ratio * totalCurrentLiabilities. */
  otherCurrentLiabilities: number;
  /** accountsPayable + accrued + currentLeases + taxesPayable + unearnedRevenue + otherCurrentLiabilities. */
  totalCurrentLiabilities: number;
  /**
   * (receivables + inventory + prepaid + otherCurrentAssets) -
   * (accountsPayable + accrued + unearnedRevenue + otherCurrentLiabilities).
   */
  netWorkingCapital: number;
  /** Prior year's (or opening) netWorkingCapital minus this year's; positive = cash release. */
  changeInNetWorkingCapital: number;
}

export interface WorkingCapitalScheduleResult {
  /** Full per-year schedule for years 1..N. */
  years: WorkingCapitalScheduleYear[];
}

/**
 * Build the days/percent-of-revenue-driven working-capital schedule for
 * years 1..N, including the algebraic solve for the circular
 * `otherCurrentLiabilities` line (see the module header for the line-by-line
 * derivation).
 *
 * Throws RangeError if `years` is empty,
 * `otherCurrentLiabilitiesPctOfTotalCurrentLiabilities` is not in [0, 1), or
 * any input is out of range.
 */
export function buildWorkingCapitalSchedule(
  input: WorkingCapitalScheduleInput,
): WorkingCapitalScheduleResult {
  assertFinite(input.openingNetWorkingCapital, "openingNetWorkingCapital");
  assertFinite(input.receivablesDays, "receivablesDays");
  assertFinite(input.inventoryDaysOfCogs, "inventoryDaysOfCogs");
  assertFinite(input.prepaidDaysOfCogs, "prepaidDaysOfCogs");
  assertFinite(input.otherCurrentAssets, "otherCurrentAssets");
  assertFinite(input.accountsPayableDaysOfCogs, "accountsPayableDaysOfCogs");
  assertFinite(input.accruedDaysOfCogs, "accruedDaysOfCogs");
  assertFinite(input.unearnedRevenuePctRevenue, "unearnedRevenuePctRevenue");
  assertFinite(
    input.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities,
    "otherCurrentLiabilitiesPctOfTotalCurrentLiabilities",
  );
  if (
    input.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities < 0 ||
    input.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities >= 1
  ) {
    throw new RangeError(
      `otherCurrentLiabilitiesPctOfTotalCurrentLiabilities must be in [0, 1), got ${input.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities}`,
    );
  }
  assertFinite(input.currentLeases, "currentLeases");
  assertFinite(input.taxesPayable, "taxesPayable");
  if (input.years.length === 0) {
    throw new RangeError("years must contain at least one forecast year");
  }

  const ratio = input.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities;
  let previousNetWorkingCapital = input.openingNetWorkingCapital;

  const years: WorkingCapitalScheduleYear[] = input.years.map((yearInput, i) => {
    const label = `years[${i}]`;
    assertFinite(yearInput.revenue, `${label}.revenue`);
    assertFinite(yearInput.cogs, `${label}.cogs`);

    const receivables = (input.receivablesDays / 365) * yearInput.revenue;
    const inventory = (input.inventoryDaysOfCogs / 365) * yearInput.cogs;
    const prepaid = (input.prepaidDaysOfCogs / 365) * yearInput.cogs;
    const otherCurrentAssets = input.otherCurrentAssets;

    const accountsPayable = (input.accountsPayableDaysOfCogs / 365) * yearInput.cogs;
    const accrued = (input.accruedDaysOfCogs / 365) * yearInput.cogs;
    const unearnedRevenue = input.unearnedRevenuePctRevenue * yearInput.revenue;

    const otherLiabilitiesExOCL =
      accountsPayable + accrued + input.currentLeases + input.taxesPayable + unearnedRevenue;
    const otherCurrentLiabilities = (ratio * otherLiabilitiesExOCL) / (1 - ratio);
    const totalCurrentLiabilities = otherLiabilitiesExOCL + otherCurrentLiabilities;

    const netWorkingCapital =
      receivables +
      inventory +
      prepaid +
      otherCurrentAssets -
      (accountsPayable + accrued + unearnedRevenue + otherCurrentLiabilities);
    const changeInNetWorkingCapital = previousNetWorkingCapital - netWorkingCapital;
    previousNetWorkingCapital = netWorkingCapital;

    return {
      year: i + 1,
      receivables,
      inventory,
      prepaid,
      otherCurrentAssets,
      accountsPayable,
      accrued,
      unearnedRevenue,
      otherCurrentLiabilities,
      totalCurrentLiabilities,
      netWorkingCapital,
      changeInNetWorkingCapital,
    };
  });

  return { years };
}

// ─────────────────────────────────────────────────────────────────────────
// Debt, interest, tax and net-income schedule (below-EBIT continuation)
//
// Picks up where `buildIncomeStatementForecast` leaves off (at EBIT) and runs
// the source Excel "3FS" sheet's below-the-line block — the debt schedule,
// interest expense/income, tax, and net income — down to the bottom line and
// the year-end cash balance.
//
//   debt_t      = targetDebtToEquity * bookValueOfEquity   (constant every
//                                                            forecast year;
//                                                            the Excel holds
//                                                            equity flat at its
//                                                            last actual level)
//   intExp_t    = AVERAGE(debt_{t-1}, debt_t) * interestRateOnDebt
//                 (debt_0 = baseTotalDebt, the last actual total debt)
//   intInc_t    = (endingCash_t + shortTermInvestments) * yieldOnCash…
//   EBT_t       = EBIT_t + intInc_t - intExp_t   (non-operating lines are 0)
//   tax_t       = EBT_t * taxRate
//   netIncome_t = EBT_t - tax_t - minorityInterest_t   (minority interest = 0,
//                                                        so netIncome = EBT*(1-tax))
//   dividends_t = payoutRatio * netIncome_t
//
// The circularity: interest income is earned on the year-end cash balance, but
// that balance is the result of an indirect-method cash rollforward that runs
// *through* net income (and the dividend it pays out), which in turn depends on
// interest income. Concretely:
//
//   changeInCash_t = netIncome_t + D&A_t + changeInNWC_t - capex_t
//                    + (debt_t - debt_{t-1}) - dividends_t
//   endingCash_t   = beginningCash_t + changeInCash_t
//   beginningCash_1 = openingCash (last actual year-end cash);
//   beginningCash_t = endingCash_{t-1}
//
// (`changeInNWC_t` uses the cash-release sign convention of
// `buildWorkingCapitalSchedule` — positive = cash in — so it is *added*, and
// `capex_t` is a positive spend, so it is subtracted.) Every operating input
// above is fixed before the year is solved, so each year is an independent
// one-variable fixed point in interest income. The map is a strong contraction
// (its slope is (1-payoutRatio)(1-taxRate) * yield ≈ 0.02), so plain successive
// substitution from a zero seed converges to ≤ 1e-9 in a handful of iterations.
// ─────────────────────────────────────────────────────────────────────────

export interface NetIncomeForecastYearInput {
  /** Operating income (EBIT) for the year — normally `buildIncomeStatementForecast(...).years[i].ebit`. */
  ebit: number;
  /** Depreciation & amortisation for the year — normally `buildPpeSchedule(...).years[i].depreciationAndAmortisation`. */
  depreciationAndAmortisation: number;
  /**
   * Change in net working capital for the year, in the *cash-release* sign
   * convention of `buildWorkingCapitalSchedule` (positive = cash inflow);
   * added straight into the operating cash rollforward.
   */
  changeInNetWorkingCapital: number;
  /** Capital expenditure for the year as a positive spend; must be >= 0. */
  capitalExpenditure: number;
}

export interface NetIncomeForecastInput {
  /** Book value of equity held flat across the forecast (last actual year); anchors the constant debt level. */
  bookValueOfEquity: number;
  /** Target debt-to-equity ratio; debt_t = targetDebtToEquity * bookValueOfEquity every year. */
  targetDebtToEquity: number;
  /** Total debt at the end of the last actual year (debt_0); anchors year 1's average debt balance. Must be >= 0. */
  baseTotalDebt: number;
  /** Interest rate applied to the average (opening + closing) debt balance; must be >= 0. */
  interestRateOnDebt: number;
  /** Cash at the end of the last actual year; anchors year 1's beginning cash. */
  openingCash: number;
  /** Short-term investments held flat across the forecast; earns the cash yield alongside cash. Must be >= 0. */
  shortTermInvestments: number;
  /** Yield earned on (ending cash + short-term investments); must be >= 0. */
  yieldOnCashAndShortTermInvestments: number;
  /** Marginal tax rate as a decimal in [0, 1). */
  taxRate: number;
  /** Dividend payout as a fraction of net income; must be in [0, 1]. */
  payoutRatio: number;
  /** Per-year operating inputs for forecast years 1..N; must be non-empty. */
  years: readonly NetIncomeForecastYearInput[];
  /**
   * Absolute convergence tolerance for the per-year interest-income fixed
   * point, in the same currency units as the cash flows. Defaults to 1e-9.
   */
  fixedPointTolerance?: number;
  /** Maximum fixed-point iterations before giving up. Defaults to 1000. */
  maxIterations?: number;
}

export interface NetIncomeForecastYear {
  /** 1-based forecast year. */
  year: number;
  /** targetDebtToEquity * bookValueOfEquity (constant across years). */
  debt: number;
  /** AVERAGE(debt_{t-1}, debt_t) * interestRateOnDebt, reported as a positive expense. */
  interestExpense: number;
  /** (endingCash + shortTermInvestments) * yieldOnCashAndShortTermInvestments, from the converged fixed point. */
  interestIncome: number;
  /** ebit + interestIncome - interestExpense (non-operating lines are 0). */
  ebt: number;
  /** ebt * taxRate. */
  incomeTaxExpense: number;
  /** Always 0 — the Excel forecasts no minority interest forward. */
  minorityInterest: number;
  /** ebt - incomeTaxExpense - minorityInterest. */
  netIncome: number;
  /** payoutRatio * netIncome. */
  dividends: number;
  /** Cash at the start of the year (prior year's ending balance, or openingCash). */
  beginningCash: number;
  /** netIncome + D&A + changeInNWC - capex + (debt_t - debt_{t-1}) - dividends. */
  changeInCash: number;
  /** beginningCash + changeInCash; feeds the interest-income base. */
  endingCash: number;
}

export interface NetIncomeForecastResult {
  /** Full per-year schedule for years 1..N. */
  years: NetIncomeForecastYear[];
}

/**
 * Build the below-EBIT debt / interest / tax / net-income schedule for years
 * 1..N, resolving the circular cash ↔ interest-income dependency per year with
 * a successive-substitution fixed point (see the module header for the
 * line-by-line derivation and why the iteration converges).
 *
 * Throws RangeError if `years` is empty, any input is out of range, or the
 * fixed point fails to converge within `maxIterations`.
 */
export function buildNetIncomeForecast(input: NetIncomeForecastInput): NetIncomeForecastResult {
  assertFinite(input.bookValueOfEquity, "bookValueOfEquity");
  assertFinite(input.targetDebtToEquity, "targetDebtToEquity");
  assertFinite(input.baseTotalDebt, "baseTotalDebt");
  if (input.baseTotalDebt < 0) {
    throw new RangeError(`baseTotalDebt must be >= 0, got ${input.baseTotalDebt}`);
  }
  assertFinite(input.interestRateOnDebt, "interestRateOnDebt");
  if (input.interestRateOnDebt < 0) {
    throw new RangeError(`interestRateOnDebt must be >= 0, got ${input.interestRateOnDebt}`);
  }
  assertFinite(input.openingCash, "openingCash");
  assertFinite(input.shortTermInvestments, "shortTermInvestments");
  if (input.shortTermInvestments < 0) {
    throw new RangeError(`shortTermInvestments must be >= 0, got ${input.shortTermInvestments}`);
  }
  assertFinite(input.yieldOnCashAndShortTermInvestments, "yieldOnCashAndShortTermInvestments");
  if (input.yieldOnCashAndShortTermInvestments < 0) {
    throw new RangeError(
      `yieldOnCashAndShortTermInvestments must be >= 0, got ${input.yieldOnCashAndShortTermInvestments}`,
    );
  }
  assertFinite(input.taxRate, "taxRate");
  if (input.taxRate < 0 || input.taxRate >= 1) {
    throw new RangeError(`taxRate must be in [0, 1), got ${input.taxRate}`);
  }
  assertFinite(input.payoutRatio, "payoutRatio");
  if (input.payoutRatio < 0 || input.payoutRatio > 1) {
    throw new RangeError(`payoutRatio must be in [0, 1], got ${input.payoutRatio}`);
  }
  if (input.years.length === 0) {
    throw new RangeError("years must contain at least one forecast year");
  }

  const tolerance = input.fixedPointTolerance ?? 1e-9;
  assertFinite(tolerance, "fixedPointTolerance");
  if (tolerance <= 0) {
    throw new RangeError(`fixedPointTolerance must be > 0, got ${tolerance}`);
  }
  const maxIterations = input.maxIterations ?? 1000;
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new RangeError(`maxIterations must be a positive integer, got ${maxIterations}`);
  }

  const debt = input.targetDebtToEquity * input.bookValueOfEquity;

  let previousDebt = input.baseTotalDebt;
  let beginningCash = input.openingCash;

  const years: NetIncomeForecastYear[] = input.years.map((yearInput, i) => {
    const label = `years[${i}]`;
    assertFinite(yearInput.ebit, `${label}.ebit`);
    assertFinite(yearInput.depreciationAndAmortisation, `${label}.depreciationAndAmortisation`);
    assertFinite(yearInput.changeInNetWorkingCapital, `${label}.changeInNetWorkingCapital`);
    assertFinite(yearInput.capitalExpenditure, `${label}.capitalExpenditure`);
    if (yearInput.capitalExpenditure < 0) {
      throw new RangeError(
        `${label}.capitalExpenditure must be >= 0, got ${yearInput.capitalExpenditure}`,
      );
    }

    const interestExpense = ((previousDebt + debt) / 2) * input.interestRateOnDebt;
    const debtIssuance = debt - previousDebt;
    // Cash-rollforward terms that do not move with net income, isolated so the
    // fixed-point loop only recomputes the parts that actually change.
    const nonIncomeCashFlow =
      yearInput.depreciationAndAmortisation +
      yearInput.changeInNetWorkingCapital -
      yearInput.capitalExpenditure +
      debtIssuance;

    let interestIncome = 0;
    let ebt = 0;
    let netIncome = 0;
    let dividends = 0;
    let changeInCash = 0;
    let endingCash = beginningCash;
    let converged = false;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      ebt = yearInput.ebit + interestIncome - interestExpense;
      const incomeTaxExpense = ebt * input.taxRate;
      netIncome = ebt - incomeTaxExpense; // minority interest = 0
      dividends = input.payoutRatio * netIncome;
      changeInCash = netIncome + nonIncomeCashFlow - dividends;
      endingCash = beginningCash + changeInCash;
      const nextInterestIncome =
        (endingCash + input.shortTermInvestments) * input.yieldOnCashAndShortTermInvestments;
      if (Math.abs(nextInterestIncome - interestIncome) <= tolerance) {
        interestIncome = nextInterestIncome;
        converged = true;
        break;
      }
      interestIncome = nextInterestIncome;
    }
    if (!converged) {
      throw new RangeError(
        `${label}: interest-income fixed point did not converge within ${maxIterations} iterations`,
      );
    }

    // Recompute the downstream lines once more off the converged interest
    // income so every reported figure is mutually consistent.
    ebt = yearInput.ebit + interestIncome - interestExpense;
    const incomeTaxExpense = ebt * input.taxRate;
    const minorityInterest = 0;
    netIncome = ebt - incomeTaxExpense - minorityInterest;
    dividends = input.payoutRatio * netIncome;
    changeInCash = netIncome + nonIncomeCashFlow - dividends;
    endingCash = beginningCash + changeInCash;

    const row: NetIncomeForecastYear = {
      year: i + 1,
      debt,
      interestExpense,
      interestIncome,
      ebt,
      incomeTaxExpense,
      minorityInterest,
      netIncome,
      dividends,
      beginningCash,
      changeInCash,
      endingCash,
    };

    previousDebt = debt;
    beginningCash = endingCash;
    return row;
  });

  return { years };
}

// ─────────────────────────────────────────────────────────────────────────
// Balance-sheet and cash-flow forecast (the closing block of the "3FS" sheet)
//
// The final forward: given the fully-solved income statement, working-capital
// schedule, PP&E schedule and net-income schedule above, assemble the
// indirect-method cash-flow statement and the projected balance sheet, and
// verify the sheet balances (totalAssets == totalLiabilities + totalEquity).
//
// Cash-flow statement (indirect method):
//   cashFromOperations_t = netIncome_t + D&A_t + changeInNWC_t   (changeInNWC in
//                          buildWorkingCapitalSchedule's cash-release sign, so
//                          a shrinking NWC is a positive inflow)
//   cashFromInvesting_t  = -capex_t                              (capex a positive spend)
//   debtIssued_t         = debt_t - debt_{t-1}                   (debt_0 = baseTotalDebt;
//                          for SIA only FY26 is non-zero at +102.40, debt flat after)
//   cashFromFinancing_t  = debtIssued_t - totalDividends_t       (totalDividends = payout × NI)
//   netChangeInCash_t    = CFO_t + CFI_t + CFF_t
//   endingCash_t         = beginningCash_t + netChangeInCash_t
//                          (beginningCash_1 = openingCash; then rolls forward)
//
// Balance sheet. Cash is the rollforward's ending balance; net PP&E, the
// working-capital current asset/liability lines, debt, and retained earnings
// are the upstream schedules' outputs; every other line is held flat at its
// last actual (FY25) level:
//   cash_t                 = endingCash_t
//   currentPortionLTDebt_t = 0
//   longTermDebt_t         = debt_t   (the constant total-debt level; all in LT)
//   retainedEarnings_t     = RE_{t-1} + netIncome_t - totalDividends_t
//                            (RE_0 = openingRetainedEarnings)
//   bookValueOfEquity_t    = commonEquity + RE_t + bookValueResidual  (residual and
//                            commonEquity both flat at FY25)
//   totalEquity_t          = bookValueOfEquity_t + minorityInterest
//
// `tradingAssetSecurities` is the FY25 reconciling asset: the source model
// carries a "Trading Asset Securities" line the `FinancialStatements` contract
// omits, so held flat at (FY25 totalAssets − Σ mapped asset lines) it makes the
// projected totals tie back to the Excel. The whole block balances to
// floating-point precision because every year-over-year asset change is offset
// by the matching cash-rollforward, debt and retained-earnings changes.
// ─────────────────────────────────────────────────────────────────────────

export interface BalanceSheetCashFlowYearInput {
  /** Net income for the year — normally `buildNetIncomeForecast(...).years[i].netIncome`. */
  netIncome: number;
  /** Total dividends (payout × net income) — normally `buildNetIncomeForecast(...).years[i].dividends`. */
  totalDividends: number;
  /** Depreciation & amortisation — normally `buildPpeSchedule(...).years[i].depreciationAndAmortisation`. */
  depreciationAndAmortisation: number;
  /**
   * Change in net working capital in the *cash-release* sign convention of
   * `buildWorkingCapitalSchedule` (positive = cash inflow); added into CFO.
   */
  changeInNetWorkingCapital: number;
  /** Capital expenditure as a positive spend; must be >= 0. */
  capitalExpenditure: number;
  /** Total debt at year-end — normally `buildNetIncomeForecast(...).years[i].debt`; sits entirely in long-term debt. */
  debt: number;
  /** Net PP&E at year-end — normally `buildPpeSchedule(...).years[i].endingNetPPE`. */
  netPPE: number;
  /** Receivables — `buildWorkingCapitalSchedule(...).years[i].receivables`. */
  receivables: number;
  /** Inventory — `buildWorkingCapitalSchedule(...).years[i].inventory`. */
  inventory: number;
  /** Prepaid expenses — `buildWorkingCapitalSchedule(...).years[i].prepaid`. */
  prepaid: number;
  /** Accounts payable — `buildWorkingCapitalSchedule(...).years[i].accountsPayable`. */
  accountsPayable: number;
  /** Accrued liabilities — `buildWorkingCapitalSchedule(...).years[i].accrued`. */
  accrued: number;
  /** Unearned (deferred) revenue — `buildWorkingCapitalSchedule(...).years[i].unearnedRevenue`. */
  unearnedRevenue: number;
  /** Other current liabilities — `buildWorkingCapitalSchedule(...).years[i].otherCurrentLiabilities`. */
  otherCurrentLiabilities: number;
}

export interface BalanceSheetCashFlowInput {
  /** Cash at the end of the last actual year (FY25); beginningCash_1. */
  openingCash: number;
  /** Total debt at the end of the last actual year (debt_0); anchors FY26 debtIssued. Must be >= 0. */
  baseTotalDebt: number;
  /** Retained earnings at the end of the last actual year (RE_0). */
  openingRetainedEarnings: number;

  // Held-flat FY25 asset lines (carried at their last actual level every year).
  /** Short-term investments, held flat at FY25. */
  shortTermInvestments: number;
  /** Trading asset securities: the FY25 reconciling asset (totalAssets − Σ mapped lines), held flat. */
  tradingAssetSecurities: number;
  /** Other current assets, held flat at FY25. */
  otherCurrentAssets: number;
  /** Long-term investments, held flat at FY25. */
  longTermInvestments: number;
  /** Goodwill, held flat at FY25. */
  goodwill: number;
  /** Intangibles, held flat at FY25. */
  intangibles: number;
  /** Other long-term assets, held flat at FY25. */
  otherLTAssets: number;

  // Held-flat FY25 liability lines.
  /** Current portion of operating leases, held flat at FY25. */
  currentLeases: number;
  /** Taxes payable, held flat at FY25. */
  taxesPayable: number;
  /** Long-term leases, held flat at FY25. */
  longTermLeases: number;
  /** Pension / OPEB obligations, held flat at FY25. */
  pensionOPEB: number;
  /** Deferred tax liability, held flat at FY25. */
  deferredTaxLiability: number;
  /** Other non-current liabilities, held flat at FY25. */
  otherNonCurrentLiabilities: number;

  // Held-flat FY25 equity lines (retained earnings rolls; these do not).
  /** Common equity (share capital + reserves ex-retained-earnings), held flat at FY25. */
  commonEquity: number;
  /** Residual reconciling book-value-of-equity ≠ commonEquity + retainedEarnings (FY25 = 2.2), held flat. */
  bookValueResidual: number;
  /** Minority interest, held flat at FY25. */
  minorityInterest: number;

  /** Per-year inputs for forecast years 1..N; must be non-empty. */
  years: readonly BalanceSheetCashFlowYearInput[];
}

export interface BalanceSheetCashFlowYear {
  /** 1-based forecast year. */
  year: number;

  // Cash-flow statement (indirect method).
  /** netIncome + D&A + changeInNWC. */
  cashFromOperations: number;
  /** -capex. */
  cashFromInvesting: number;
  /** debt_t - debt_{t-1} (debt_0 = baseTotalDebt). */
  debtIssued: number;
  /** As supplied on the input (payout × net income). */
  totalDividends: number;
  /** debtIssued - totalDividends. */
  cashFromFinancing: number;
  /** cashFromOperations + cashFromInvesting + cashFromFinancing. */
  netChangeInCash: number;
  /** Cash at the start of the year (prior year's ending balance, or openingCash). */
  beginningCash: number;
  /** beginningCash + netChangeInCash. */
  endingCash: number;

  // Balance sheet — assets.
  /** = endingCash. */
  cash: number;
  /** Held flat at FY25. */
  shortTermInvestments: number;
  /** Held flat at FY25 (the reconciling line). */
  tradingAssetSecurities: number;
  /** From the working-capital schedule. */
  receivables: number;
  /** From the working-capital schedule. */
  inventory: number;
  /** From the working-capital schedule. */
  prepaid: number;
  /** Held flat at FY25. */
  otherCurrentAssets: number;
  /** From the PP&E schedule (ending net PP&E). */
  netPPE: number;
  /** Held flat at FY25. */
  longTermInvestments: number;
  /** Held flat at FY25. */
  goodwill: number;
  /** Held flat at FY25. */
  intangibles: number;
  /** Held flat at FY25. */
  otherLTAssets: number;
  /** Sum of every asset line above. */
  totalAssets: number;

  // Balance sheet — liabilities.
  /** From the working-capital schedule. */
  accountsPayable: number;
  /** From the working-capital schedule. */
  accrued: number;
  /** Always 0 in the forecast. */
  currentPortionLTDebt: number;
  /** Held flat at FY25. */
  currentLeases: number;
  /** Held flat at FY25. */
  taxesPayable: number;
  /** From the working-capital schedule. */
  unearnedRevenue: number;
  /** From the working-capital schedule. */
  otherCurrentLiabilities: number;
  /** = debt (the constant total-debt level, all carried as long-term). */
  longTermDebt: number;
  /** Held flat at FY25. */
  longTermLeases: number;
  /** Held flat at FY25. */
  pensionOPEB: number;
  /** Held flat at FY25. */
  deferredTaxLiability: number;
  /** Held flat at FY25. */
  otherNonCurrentLiabilities: number;
  /** Sum of every liability line above. */
  totalLiabilities: number;

  // Balance sheet — equity.
  /** Held flat at FY25. */
  commonEquity: number;
  /** RE_{t-1} + netIncome - totalDividends. */
  retainedEarnings: number;
  /** commonEquity + retainedEarnings + bookValueResidual. */
  bookValueOfEquity: number;
  /** Held flat at FY25. */
  minorityInterest: number;
  /** bookValueOfEquity + minorityInterest. */
  totalEquity: number;
}

export interface BalanceSheetCashFlowResult {
  /** Full per-year schedule for years 1..N. */
  years: BalanceSheetCashFlowYear[];
}

/**
 * Assemble the indirect-method cash-flow statement and the projected balance
 * sheet for years 1..N from the upstream income-statement, working-capital,
 * PP&E and net-income schedules (see the module header for the line-by-line
 * derivation). The block balances to floating-point precision:
 * `totalAssets == totalLiabilities + totalEquity` each year.
 *
 * Throws RangeError if `years` is empty or any input is out of range.
 */
export function buildBalanceSheetCashFlowForecast(
  input: BalanceSheetCashFlowInput,
): BalanceSheetCashFlowResult {
  assertFinite(input.openingCash, "openingCash");
  assertFinite(input.baseTotalDebt, "baseTotalDebt");
  if (input.baseTotalDebt < 0) {
    throw new RangeError(`baseTotalDebt must be >= 0, got ${input.baseTotalDebt}`);
  }
  assertFinite(input.openingRetainedEarnings, "openingRetainedEarnings");
  assertFinite(input.shortTermInvestments, "shortTermInvestments");
  assertFinite(input.tradingAssetSecurities, "tradingAssetSecurities");
  assertFinite(input.otherCurrentAssets, "otherCurrentAssets");
  assertFinite(input.longTermInvestments, "longTermInvestments");
  assertFinite(input.goodwill, "goodwill");
  assertFinite(input.intangibles, "intangibles");
  assertFinite(input.otherLTAssets, "otherLTAssets");
  assertFinite(input.currentLeases, "currentLeases");
  assertFinite(input.taxesPayable, "taxesPayable");
  assertFinite(input.longTermLeases, "longTermLeases");
  assertFinite(input.pensionOPEB, "pensionOPEB");
  assertFinite(input.deferredTaxLiability, "deferredTaxLiability");
  assertFinite(input.otherNonCurrentLiabilities, "otherNonCurrentLiabilities");
  assertFinite(input.commonEquity, "commonEquity");
  assertFinite(input.bookValueResidual, "bookValueResidual");
  assertFinite(input.minorityInterest, "minorityInterest");
  if (input.years.length === 0) {
    throw new RangeError("years must contain at least one forecast year");
  }

  let previousDebt = input.baseTotalDebt;
  let beginningCash = input.openingCash;
  let retainedEarnings = input.openingRetainedEarnings;

  const years: BalanceSheetCashFlowYear[] = input.years.map((yearInput, i) => {
    const label = `years[${i}]`;
    assertFinite(yearInput.netIncome, `${label}.netIncome`);
    assertFinite(yearInput.totalDividends, `${label}.totalDividends`);
    assertFinite(yearInput.depreciationAndAmortisation, `${label}.depreciationAndAmortisation`);
    assertFinite(yearInput.changeInNetWorkingCapital, `${label}.changeInNetWorkingCapital`);
    assertFinite(yearInput.capitalExpenditure, `${label}.capitalExpenditure`);
    if (yearInput.capitalExpenditure < 0) {
      throw new RangeError(
        `${label}.capitalExpenditure must be >= 0, got ${yearInput.capitalExpenditure}`,
      );
    }
    assertFinite(yearInput.debt, `${label}.debt`);
    assertFinite(yearInput.netPPE, `${label}.netPPE`);
    assertFinite(yearInput.receivables, `${label}.receivables`);
    assertFinite(yearInput.inventory, `${label}.inventory`);
    assertFinite(yearInput.prepaid, `${label}.prepaid`);
    assertFinite(yearInput.accountsPayable, `${label}.accountsPayable`);
    assertFinite(yearInput.accrued, `${label}.accrued`);
    assertFinite(yearInput.unearnedRevenue, `${label}.unearnedRevenue`);
    assertFinite(yearInput.otherCurrentLiabilities, `${label}.otherCurrentLiabilities`);

    // Cash-flow statement.
    const cashFromOperations =
      yearInput.netIncome +
      yearInput.depreciationAndAmortisation +
      yearInput.changeInNetWorkingCapital;
    const cashFromInvesting = -yearInput.capitalExpenditure;
    const debtIssued = yearInput.debt - previousDebt;
    const totalDividends = yearInput.totalDividends;
    const cashFromFinancing = debtIssued - totalDividends;
    const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;
    const endingCash = beginningCash + netChangeInCash;

    // Retained-earnings rollforward.
    retainedEarnings = retainedEarnings + yearInput.netIncome - totalDividends;

    // Balance sheet — assets.
    const cash = endingCash;
    const totalAssets =
      cash +
      input.shortTermInvestments +
      input.tradingAssetSecurities +
      yearInput.receivables +
      yearInput.inventory +
      yearInput.prepaid +
      input.otherCurrentAssets +
      yearInput.netPPE +
      input.longTermInvestments +
      input.goodwill +
      input.intangibles +
      input.otherLTAssets;

    // Balance sheet — liabilities.
    const currentPortionLTDebt = 0;
    const longTermDebt = yearInput.debt;
    const totalLiabilities =
      yearInput.accountsPayable +
      yearInput.accrued +
      currentPortionLTDebt +
      input.currentLeases +
      input.taxesPayable +
      yearInput.unearnedRevenue +
      yearInput.otherCurrentLiabilities +
      longTermDebt +
      input.longTermLeases +
      input.pensionOPEB +
      input.deferredTaxLiability +
      input.otherNonCurrentLiabilities;

    // Balance sheet — equity.
    const bookValueOfEquity = input.commonEquity + retainedEarnings + input.bookValueResidual;
    const totalEquity = bookValueOfEquity + input.minorityInterest;

    const row: BalanceSheetCashFlowYear = {
      year: i + 1,
      cashFromOperations,
      cashFromInvesting,
      debtIssued,
      totalDividends,
      cashFromFinancing,
      netChangeInCash,
      beginningCash,
      endingCash,
      cash,
      shortTermInvestments: input.shortTermInvestments,
      tradingAssetSecurities: input.tradingAssetSecurities,
      receivables: yearInput.receivables,
      inventory: yearInput.inventory,
      prepaid: yearInput.prepaid,
      otherCurrentAssets: input.otherCurrentAssets,
      netPPE: yearInput.netPPE,
      longTermInvestments: input.longTermInvestments,
      goodwill: input.goodwill,
      intangibles: input.intangibles,
      otherLTAssets: input.otherLTAssets,
      totalAssets,
      accountsPayable: yearInput.accountsPayable,
      accrued: yearInput.accrued,
      currentPortionLTDebt,
      currentLeases: input.currentLeases,
      taxesPayable: input.taxesPayable,
      unearnedRevenue: yearInput.unearnedRevenue,
      otherCurrentLiabilities: yearInput.otherCurrentLiabilities,
      longTermDebt,
      longTermLeases: input.longTermLeases,
      pensionOPEB: input.pensionOPEB,
      deferredTaxLiability: input.deferredTaxLiability,
      otherNonCurrentLiabilities: input.otherNonCurrentLiabilities,
      totalLiabilities,
      commonEquity: input.commonEquity,
      retainedEarnings,
      bookValueOfEquity,
      minorityInterest: input.minorityInterest,
      totalEquity,
    };

    previousDebt = yearInput.debt;
    beginningCash = endingCash;
    return row;
  });

  return { years };
}

// ─────────────────────────────────────────────────────────────────────────
// Composed forecast: wires the PP&E, income-statement, working-capital,
// net-income and balance-sheet/cash-flow schedules above into a single full
// per-year projection off a company's historical `FinancialStatements`, plus
// a summarised FCFF driver schedule and the NTM (next-twelve-months)
// metrics the valuation engines consume.
//
// `deriveOperatingAssumptions(historicals)` supplies every trailing-average
// driver (COGS/SG&A/other-opex %, working-capital days/percents, the D&A
// rate on net PPE, target debt-to-equity, interest rate on debt, cash
// yield, payout ratio); `ForecastAssumptions` supplies only what can't be
// derived from the historical statements — the per-year revenue-growth,
// COGS% and capex assumptions, and the tax rate. Revenue does not depend on
// D&A, so it is computed once (with a zero-D&A placeholder) to feed the
// PP&E schedule's display-only gross-PPE line, then the income statement is
// rebuilt with the resulting real per-year D&A.
//
// The unlevered FCFF tax shield uses the source Excel's flat 17% statutory
// rate (`FCFF_TAX_RATE`) applied directly to EBIT — the standard unlevered
// FCFF convention — regardless of `ForecastAssumptions.taxRate`, which taxes
// EBT (net of interest income/expense) in the below-EBIT net-income
// schedule. The two happen to coincide for SIA but are conceptually
// distinct lines.
// ─────────────────────────────────────────────────────────────────────────

/** Flat statutory tax rate applied to EBIT for the unlevered FCFF NOPAT line. */
export const FCFF_TAX_RATE = 0.17;

export interface ForecastYearAssumptions {
  /** Base-case year-over-year revenue growth as a decimal; must be > -1. */
  revenueGrowthBase: number;
  /** Base-case COGS as a fraction of revenue for the year. */
  cogsPctRevenueBase: number;
  /** Capital expenditure for the year, as a positive spend; must be >= 0. */
  capitalExpenditure: number;
}

export interface ForecastAssumptions {
  /** Marginal tax rate applied to EBT in the below-EBIT net-income schedule; must be in [0, 1). */
  taxRate: number;
  /**
   * Gross PPE as a fraction of revenue, for the PP&E schedule's
   * display-only gross-PPE line; not derivable from `FinancialStatements`
   * (which carries only net PPE). Defaults to 0.
   */
  grossPpeToSalesRatio?: number;
  /** Scenario offsets for the income-statement forecast; defaults to `DEFAULT_SCENARIO_OFFSETS`. */
  offsets?: Partial<typeof DEFAULT_SCENARIO_OFFSETS>;
  /** Per-year revenue-growth/COGS%/capex assumptions for forecast years 1..N; must be non-empty. */
  years: readonly ForecastYearAssumptions[];
}

export interface ForecastDriverYear {
  /** 1-based forecast year. */
  year: number;
  /** Forecast revenue for the year. */
  revenue: number;
  /** Forecast EBIT for the year. */
  ebit: number;
  /** Forecast EBITDA for the year. */
  ebitda: number;
  /** Depreciation & amortisation for the year. */
  dandA: number;
  /** Capital expenditure for the year, as a NEGATIVE cash outflow. */
  capex: number;
  /** Change in net working capital, cash-release sign (positive = inflow). */
  changeNWC: number;
  /** Forecast net income for the year. */
  netIncome: number;
  /** ebit * (1 - FCFF_TAX_RATE) + dandA + capex + changeNWC. */
  fcff: number;
}

export interface ForecastDrivers {
  /** Full per-year FCFF driver schedule for years 1..N. */
  years: ForecastDriverYear[];
  /** fcff for years 1..N, ready to feed dcf(). */
  freeCashFlows: number[];
  /** Final forecast year's EBITDA. */
  terminalEBITDA: number;
  /** terminalEBITDA / final forecast year's revenue. */
  terminalEBITDAMargin: number;
}

export interface NtmMetrics {
  /** Forecast year-1 net income (next twelve months' earnings). */
  ntmEarnings: number;
  /** Forecast year-1 EBITDA. */
  ntmEbitda: number;
  /** Constant forecast total debt (targetDebtToEquity * bookValueOfEquity). */
  ntmDebt: number;
  /** Forecast year-1 ending cash balance. */
  ntmCash: number;
}

export interface ForecastResult {
  /** Income-statement (P&L) forecast down to EBIT/EBITDA. */
  incomeStatement: IncomeStatementForecastResult;
  /** PP&E and D&A rollforward. */
  ppe: PpeScheduleResult;
  /** Working-capital schedule. */
  workingCapital: WorkingCapitalScheduleResult;
  /** Below-EBIT debt/interest/tax/net-income schedule. */
  netIncome: NetIncomeForecastResult;
  /** Balance-sheet and cash-flow forecast (the closing block). */
  balanceSheetCashFlow: BalanceSheetCashFlowResult;
  /** Summarised FCFF driver schedule for the DCF. */
  drivers: ForecastDrivers;
  /** Next-twelve-months metrics (forecast year 1). */
  ntm: NtmMetrics;
}

function lastOf(values: readonly number[]): number {
  const value = values[values.length - 1];
  if (value === undefined) {
    throw new RangeError("expected a non-empty historical series");
  }
  return value;
}

/**
 * Build the full forecast (P&L, PP&E, working capital, debt/net-income,
 * balance sheet & cash flow) for years 1..N off a company's historical
 * `FinancialStatements`, under the given Bear/Base/Bull scenario, plus the
 * summarised FCFF driver schedule and NTM metrics the valuation engines
 * consume (see the module header for the derivation).
 *
 * Throws RangeError if `assumptions.years` is empty, `historicals` has
 * fewer than 5 fiscal years, or any downstream schedule input is out of
 * range.
 */
export function buildForecast(
  historicals: FinancialStatements,
  assumptions: ForecastAssumptions,
  scenario: Scenario,
): ForecastResult {
  if (assumptions.years.length === 0) {
    throw new RangeError("assumptions.years must contain at least one forecast year");
  }

  const operating = deriveOperatingAssumptions(historicals);
  const { incomeStatement: is, balanceSheet: bs } = historicals;
  const baseRevenue = lastOf(is.revenue);
  const offsets = assumptions.offsets ? { offsets: assumptions.offsets } : {};

  // Revenue does not depend on D&A, so compute it first (zero-D&A
  // placeholder) to feed the PP&E schedule's display-only gross-PPE line.
  const revenueOnly = buildIncomeStatementForecast({
    scenario,
    baseRevenue,
    sgaPctRevenueBase: operating.sgaPctRevenue,
    otherOpExPctRevenueBase: operating.otherOpExPctRevenue,
    ...offsets,
    years: assumptions.years.map((y) => ({
      revenueGrowthBase: y.revenueGrowthBase,
      cogsPctRevenueBase: y.cogsPctRevenueBase,
      depreciationAndAmortisation: 0,
    })),
  });

  const ppe = buildPpeSchedule({
    baseNetPPE: lastOf(bs.netPPE),
    depreciationRateOnNetPPE: operating.depreciationRateOnNetPPE,
    grossPpeToSalesRatio: assumptions.grossPpeToSalesRatio ?? 0,
    years: assumptions.years.map((y, i) => ({
      capitalExpenditure: y.capitalExpenditure,
      revenue: revenueOnly.years[i]!.revenue,
    })),
  });

  const incomeStatement = buildIncomeStatementForecast({
    scenario,
    baseRevenue,
    sgaPctRevenueBase: operating.sgaPctRevenue,
    otherOpExPctRevenueBase: operating.otherOpExPctRevenue,
    ...offsets,
    years: assumptions.years.map((y, i) => ({
      revenueGrowthBase: y.revenueGrowthBase,
      cogsPctRevenueBase: y.cogsPctRevenueBase,
      depreciationAndAmortisation: ppe.years[i]!.depreciationAndAmortisation,
    })),
  });

  const openingNetWorkingCapital =
    lastOf(bs.receivables) +
    lastOf(bs.inventory) +
    lastOf(bs.prepaid) +
    lastOf(bs.otherCurrentAssets) -
    (lastOf(bs.accountsPayable) +
      lastOf(bs.accrued) +
      lastOf(bs.unearnedRevCurrent) +
      lastOf(bs.otherCurrentLiabilities));

  const workingCapital = buildWorkingCapitalSchedule({
    openingNetWorkingCapital,
    receivablesDays: operating.receivablesDays,
    inventoryDaysOfCogs: operating.inventoryDaysOfCogs,
    prepaidDaysOfCogs: operating.prepaidDaysOfCogs,
    otherCurrentAssets: lastOf(bs.otherCurrentAssets),
    accountsPayableDaysOfCogs: operating.accountsPayableDaysOfCogs,
    accruedDaysOfCogs: operating.accruedDaysOfCogs,
    unearnedRevenuePctRevenue: operating.unearnedRevenuePctRevenue,
    otherCurrentLiabilitiesPctOfTotalCurrentLiabilities:
      operating.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities,
    currentLeases: lastOf(bs.currentLeases),
    taxesPayable: lastOf(bs.taxesPayable),
    years: incomeStatement.years.map((y) => ({ revenue: y.revenue, cogs: y.cogs })),
  });

  const baseTotalDebt = lastOf(bs.currentPortionLTDebt) + lastOf(bs.longTermDebt);

  const netIncome = buildNetIncomeForecast({
    bookValueOfEquity: lastOf(bs.bookValueOfEquity),
    targetDebtToEquity: operating.targetDebtToEquity,
    baseTotalDebt,
    interestRateOnDebt: operating.interestRateOnDebt,
    openingCash: lastOf(bs.cash),
    shortTermInvestments: lastOf(bs.shortTermInvestments),
    yieldOnCashAndShortTermInvestments: operating.yieldOnCashAndShortTermInvestments,
    taxRate: assumptions.taxRate,
    payoutRatio: operating.payoutRatio,
    years: incomeStatement.years.map((y, i) => ({
      ebit: y.ebit,
      depreciationAndAmortisation: ppe.years[i]!.depreciationAndAmortisation,
      changeInNetWorkingCapital: workingCapital.years[i]!.changeInNetWorkingCapital,
      capitalExpenditure: ppe.years[i]!.capitalExpenditure,
    })),
  });

  const tradingAssetSecurities =
    lastOf(bs.totalAssets) -
    (lastOf(bs.cash) +
      lastOf(bs.shortTermInvestments) +
      lastOf(bs.receivables) +
      lastOf(bs.inventory) +
      lastOf(bs.prepaid) +
      lastOf(bs.otherCurrentAssets) +
      lastOf(bs.netPPE) +
      lastOf(bs.longTermInvestments) +
      lastOf(bs.goodwill) +
      lastOf(bs.intangibles) +
      lastOf(bs.otherLTAssets));

  const bookValueResidual =
    lastOf(bs.bookValueOfEquity) - lastOf(bs.commonEquity) - lastOf(bs.retainedEarnings);

  const balanceSheetCashFlow = buildBalanceSheetCashFlowForecast({
    openingCash: lastOf(bs.cash),
    baseTotalDebt,
    openingRetainedEarnings: lastOf(bs.retainedEarnings),
    shortTermInvestments: lastOf(bs.shortTermInvestments),
    tradingAssetSecurities,
    otherCurrentAssets: lastOf(bs.otherCurrentAssets),
    longTermInvestments: lastOf(bs.longTermInvestments),
    goodwill: lastOf(bs.goodwill),
    intangibles: lastOf(bs.intangibles),
    otherLTAssets: lastOf(bs.otherLTAssets),
    currentLeases: lastOf(bs.currentLeases),
    taxesPayable: lastOf(bs.taxesPayable),
    longTermLeases: lastOf(bs.longTermLeases),
    pensionOPEB: lastOf(bs.pensionOPEB),
    deferredTaxLiability: lastOf(bs.deferredTaxLiability),
    otherNonCurrentLiabilities: lastOf(bs.otherNonCurrentLiabilities),
    commonEquity: lastOf(bs.commonEquity),
    bookValueResidual,
    minorityInterest: lastOf(bs.minorityInterest),
    years: netIncome.years.map((y, i) => ({
      netIncome: y.netIncome,
      totalDividends: y.dividends,
      depreciationAndAmortisation: ppe.years[i]!.depreciationAndAmortisation,
      changeInNetWorkingCapital: workingCapital.years[i]!.changeInNetWorkingCapital,
      capitalExpenditure: ppe.years[i]!.capitalExpenditure,
      debt: y.debt,
      netPPE: ppe.years[i]!.endingNetPPE,
      receivables: workingCapital.years[i]!.receivables,
      inventory: workingCapital.years[i]!.inventory,
      prepaid: workingCapital.years[i]!.prepaid,
      accountsPayable: workingCapital.years[i]!.accountsPayable,
      accrued: workingCapital.years[i]!.accrued,
      unearnedRevenue: workingCapital.years[i]!.unearnedRevenue,
      otherCurrentLiabilities: workingCapital.years[i]!.otherCurrentLiabilities,
    })),
  });

  const driverYears: ForecastDriverYear[] = incomeStatement.years.map((y, i) => {
    const dandA = ppe.years[i]!.depreciationAndAmortisation;
    const capex = -ppe.years[i]!.capitalExpenditure;
    const changeNWC = workingCapital.years[i]!.changeInNetWorkingCapital;
    return {
      year: y.year,
      revenue: y.revenue,
      ebit: y.ebit,
      ebitda: y.ebitda,
      dandA,
      capex,
      changeNWC,
      netIncome: netIncome.years[i]!.netIncome,
      fcff: y.ebit * (1 - FCFF_TAX_RATE) + dandA + capex + changeNWC,
    };
  });

  const terminalDriverYear = driverYears[driverYears.length - 1]!;
  const drivers: ForecastDrivers = {
    years: driverYears,
    freeCashFlows: driverYears.map((y) => y.fcff),
    terminalEBITDA: terminalDriverYear.ebitda,
    terminalEBITDAMargin: terminalDriverYear.ebitda / terminalDriverYear.revenue,
  };

  const ntm: NtmMetrics = {
    ntmEarnings: netIncome.years[0]!.netIncome,
    ntmEbitda: incomeStatement.years[0]!.ebitda,
    ntmDebt: netIncome.years[0]!.debt,
    ntmCash: balanceSheetCashFlow.years[0]!.cash,
  };

  return { incomeStatement, ppe, workingCapital, netIncome, balanceSheetCashFlow, drivers, ntm };
}
