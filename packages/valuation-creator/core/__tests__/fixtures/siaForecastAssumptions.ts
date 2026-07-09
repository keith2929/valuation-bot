// Tier-3 fixture for the composed forecast (src/forecast.ts: buildForecast).
//
// `ForecastAssumptions` only supplies what `deriveOperatingAssumptions`
// cannot derive from `SIA_FINANCIALS` itself: the per-year revenue-growth
// and COGS% base assumptions (transcribed from the source Excel "3FS"
// sheet, same values as `siaIncomeStatementBaseInput` in
// siaIncomeStatement.ts), the per-year capex programme (same values as
// `siaPpeScheduleInput` in siaPpeSchedule.ts), the display-only
// `grossPpeToSalesRatio`, and the 17% statutory tax rate
// (`siaNetIncomeInput.taxRate` in siaNetIncome.ts).
//
// Every other driver (SG&A%/other-opex%, working-capital days/percents,
// the D&A rate on net PPE, target debt-to-equity, interest rate on debt,
// cash yield, payout ratio) is derived by `buildForecast` itself via
// `deriveOperatingAssumptions(SIA_FINANCIALS)`, so this fixture does not
// repeat them.

import type { ForecastAssumptions } from "../../src/forecast";

export const siaForecastAssumptions: ForecastAssumptions = {
  taxRate: 0.17,
  grossPpeToSalesRatio: (31553 + 33701.599999999999) / 2 / 19539.8,
  years: [
    { revenueGrowthBase: 0.022931184556648665, cogsPctRevenueBase: 0.66639561517925916, capitalExpenditure: 3500 },
    { revenueGrowthBase: 0.028951006185113037, cogsPctRevenueBase: 0.71, capitalExpenditure: 4700 },
    { revenueGrowthBase: 0.028997448663183434, cogsPctRevenueBase: 0.71, capitalExpenditure: 4100 },
    { revenueGrowthBase: 0.02, cogsPctRevenueBase: 0.66639561517925916, capitalExpenditure: 3800 },
    { revenueGrowthBase: 0.02, cogsPctRevenueBase: 0.66639561517925916, capitalExpenditure: 3000 },
  ],
};

/** Absolute tolerance for comparing forecast schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

/** Expected FCFF schedule for years 1..5, ebit*(1-0.17)+D&A+capex(neg)+changeNWC. */
export const siaForecastExpectedFreeCashFlows = [
  856.33937368018996, -626.7634093456918, -184.88719473764149, 581.07264332552313,
  1797.7650079705654,
] as const;

/** Expected terminal (year-5) EBITDA margin: terminal EBITDA / terminal revenue. */
export const SIA_FORECAST_TERMINAL_EBITDA_MARGIN = 0.22382338114303521;

/** Expected NTM (forecast year-1 / FY26) metrics. */
export const siaForecastExpectedNtm = {
  ntmEarnings: 1785.4062296108814,
  ntmEbitda: 4473.7528153532076,
  ntmDebt: 9613.1015894271604,
  ntmCash: 8405.1389537723535,
} as const;
