// Tier-2 fixture for the income-statement (P&L) forecast with the
// Bear/Base/Bull scenario toggle (src/forecast.ts: buildIncomeStatementForecast).
//
// All inputs are transcribed from the source Excel model's "3FS" sheet
// (income-statement forecast section, rows 156-174), which computes each
// scenario via `CHOOSE($D$3, bear, base, bull)` cells:
// - `revenueGrowthBase` per year is the sheet's Base revenue-growth row
//   (row 158), itself equal to the CIQ consensus growth for years 1-2 and a
//   CAGR taper for years 3-5.
// - `cogsPctRevenueBase` per year is the sheet's Base COGS% row (row 163):
//   years 1, 4, 5 are the trailing-4-year average of historical COGS/revenue
//   (== `deriveOperatingAssumptions(SIA_FINANCIALS).cogsPctRevenue`); years 2
//   and 3 are a 0.71 override.
// - `sgaPctRevenueBase`/`otherOpExPctRevenueBase` are held constant across
//   all five years in the sheet (rows 168/173 repeat the same trailing
//   average), equal to `deriveOperatingAssumptions(SIA_FINANCIALS).sgaPctRevenue`
//   and `.otherOpExPctRevenue` respectively.
// - `depreciationAndAmortisation` per year is
//   `siaPpeExpectedSchedules.depreciationAndAmortisation` (siaPpeSchedule.ts),
//   scenario-independent.
//
// Expected EBIT/EBITDA schedules were read directly off the sheet (rows 22
// and 25) and are exact to full floating-point precision (not rounded),
// so the tolerance below only needs to absorb transcription noise.

import type { IncomeStatementForecastInput } from "../../src/forecast";
import { siaPpeExpectedSchedules } from "./siaPpeSchedule";

/** Absolute tolerance for comparing forecast schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

/** Base-case revenue of the last actual (FY2025) year. */
export const SIA_BASE_REVENUE = 19539.8;

/** Trailing-4-year average of historical COGS/revenue (source model's derived COGS% base). */
export const SIA_COGS_PCT_REVENUE_DERIVED_AVERAGE = 0.66639561517925916;

/** Trailing-3-year average of historical SG&A/revenue (source model's derived SG&A% base). */
export const SIA_SGA_PCT_REVENUE_DERIVED_AVERAGE = 0.043623724688156139;

/** FY2025 (most recent year) other-operating-expense/revenue (source model's derived base). */
export const SIA_OTHER_OPEX_PCT_REVENUE_DERIVED_AVERAGE = 0.066157278989549539;

const YEAR_DANDA = siaPpeExpectedSchedules.depreciationAndAmortisation;

export const siaIncomeStatementBaseInput: IncomeStatementForecastInput = {
  scenario: "base",
  baseRevenue: SIA_BASE_REVENUE,
  sgaPctRevenueBase: SIA_SGA_PCT_REVENUE_DERIVED_AVERAGE,
  otherOpExPctRevenueBase: SIA_OTHER_OPEX_PCT_REVENUE_DERIVED_AVERAGE,
  years: [
    {
      revenueGrowthBase: 0.022931184556648665,
      cogsPctRevenueBase: SIA_COGS_PCT_REVENUE_DERIVED_AVERAGE,
      depreciationAndAmortisation: YEAR_DANDA[0]!,
    },
    {
      revenueGrowthBase: 0.028951006185113037,
      cogsPctRevenueBase: 0.71,
      depreciationAndAmortisation: YEAR_DANDA[1]!,
    },
    {
      revenueGrowthBase: 0.028997448663183434,
      cogsPctRevenueBase: 0.71,
      depreciationAndAmortisation: YEAR_DANDA[2]!,
    },
    {
      revenueGrowthBase: 0.02,
      cogsPctRevenueBase: SIA_COGS_PCT_REVENUE_DERIVED_AVERAGE,
      depreciationAndAmortisation: YEAR_DANDA[3]!,
    },
    {
      revenueGrowthBase: 0.02,
      cogsPctRevenueBase: SIA_COGS_PCT_REVENUE_DERIVED_AVERAGE,
      depreciationAndAmortisation: YEAR_DANDA[4]!,
    },
  ],
};

/** Expected Base-case revenue/EBIT/EBITDA schedules for years 1..5, read off the sheet. */
export const siaIncomeStatementExpectedSchedules = {
  revenue: [
    19987.87076, 20566.53973, 21162.91691, 21586.1752482, 22017.8987532,
  ],
  ebit: [
    2120.2019459541789, 1225.7004613745976, 1086.8960137316826, 1952.0623419238118,
    1946.5296141405852,
  ],
  ebitda: [
    4473.7528153532076, 3706.4811479631908, 3813.9596447723106, 4831.4907299982187,
    4928.120544598185,
  ],
} as const;

/** FY2026 (year 1) Bear-scenario COGS% spot check: base - 2% offset. */
export const SIA_FY26_BEAR_COGS_PCT_REVENUE = 0.64639561517925914;
