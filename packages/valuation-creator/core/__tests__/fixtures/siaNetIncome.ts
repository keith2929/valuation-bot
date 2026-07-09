// Tier-2 fixture for the debt / interest / tax / net-income schedule
// (src/forecast.ts: buildNetIncomeForecast).
//
// This is the below-EBIT continuation of the source Excel "3FS" sheet, so its
// per-year operating inputs are drawn straight from the upstream schedules
// rather than re-derived:
// - `ebit` per year is the Base-case operating income from
//   `siaIncomeStatementExpectedSchedules.ebit` (siaIncomeStatement.ts, "3FS"
//   row 22).
// - `depreciationAndAmortisation` per year is
//   `siaPpeExpectedSchedules.depreciationAndAmortisation` (siaPpeSchedule.ts,
//   "3FS" row 245/112).
// - `changeInNetWorkingCapital` per year is
//   `siaWorkingCapitalExpectedSchedules.changeInNetWorkingCapital`
//   (siaWorkingCapital.ts, "3FS" row 234/121) — the same cash-release sign the
//   schedule adds into cash from operations.
// - `capitalExpenditure` per year is the direct capex input from
//   `siaPpeScheduleInput` (siaPpeSchedule.ts, "3FS" row 244).
//
// The capital-structure/return drivers (targetDebtToEquity, interestRateOnDebt,
// yieldOnCashAndShortTermInvestments, payoutRatio) are
// `deriveOperatingAssumptions(SIA_FINANCIALS)`'s own trailing-average values
// (see assumptions.test.ts). `bookValueOfEquity` (15656.2), `baseTotalDebt`
// (currentPortionLTDebt 2213.4 + longTermDebt 7297.3 = 9510.7), `openingCash`
// (8257.1) and `shortTermInvestments` (965.1) are the FY2025 balance-sheet
// levels from siaAssumptions.ts; `taxRate` is the source model's 17% statutory
// rate (Valuation!$N$11, "3FS" row 45).
//
// Expected interest-income and net-income schedules were read directly off the
// sheet ("3FS" rows 29/263 and 49) and must be reproduced within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS — the circular cash ↔ interest-income solve
// converges to well inside that tolerance.

import { deriveOperatingAssumptions } from "../../src/forecast";
import type { NetIncomeForecastInput } from "../../src/forecast";
import { SIA_FINANCIALS } from "./siaAssumptions";
import { siaIncomeStatementExpectedSchedules } from "./siaIncomeStatement";
import { siaPpeExpectedSchedules, siaPpeScheduleInput } from "./siaPpeSchedule";
import { siaWorkingCapitalExpectedSchedules } from "./siaWorkingCapital";

/** Absolute tolerance for comparing schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

/** FY2025 book value of equity (held flat as the debt anchor), S$ millions. */
export const SIA_FY25_BOOK_VALUE_OF_EQUITY = 15656.2;

/** FY2025 total debt (currentPortionLTDebt 2213.4 + longTermDebt 7297.3), S$ millions. */
export const SIA_FY25_TOTAL_DEBT = 2213.4 + 7297.3;

/** FY2025 year-end cash, S$ millions. */
export const SIA_FY25_CASH = 8257.1;

/** FY2025 short-term investments (held flat), S$ millions. */
export const SIA_FY25_SHORT_TERM_INVESTMENTS = 965.1;

/** Source model's statutory tax rate (Valuation!$N$11). */
export const SIA_TAX_RATE = 0.17;

const assumptions = deriveOperatingAssumptions(SIA_FINANCIALS);

const ebit = siaIncomeStatementExpectedSchedules.ebit;
const danda = siaPpeExpectedSchedules.depreciationAndAmortisation;
const changeNWC = siaWorkingCapitalExpectedSchedules.changeInNetWorkingCapital;
const capex = siaPpeScheduleInput.years.map((year) => year.capitalExpenditure);

export const siaNetIncomeInput: NetIncomeForecastInput = {
  bookValueOfEquity: SIA_FY25_BOOK_VALUE_OF_EQUITY,
  targetDebtToEquity: assumptions.targetDebtToEquity,
  baseTotalDebt: SIA_FY25_TOTAL_DEBT,
  interestRateOnDebt: assumptions.interestRateOnDebt,
  openingCash: SIA_FY25_CASH,
  shortTermInvestments: SIA_FY25_SHORT_TERM_INVESTMENTS,
  yieldOnCashAndShortTermInvestments: assumptions.yieldOnCashAndShortTermInvestments,
  taxRate: SIA_TAX_RATE,
  payoutRatio: assumptions.payoutRatio,
  years: ebit.map((value, i) => ({
    ebit: value,
    depreciationAndAmortisation: danda[i]!,
    changeInNetWorkingCapital: changeNWC[i]!,
    capitalExpenditure: capex[i]!,
  })),
};

/**
 * Expected below-EBIT schedules for years 1..5, read off the "3FS" sheet.
 * `debt` is constant (targetDebtToEquity * FY2025 equity); interest expense,
 * interest income, net income, dividends and ending cash are the sheet's
 * rows 260, 263, 49, 143 and 151 respectively.
 */
export const siaNetIncomeExpectedSchedules = {
  debt: [
    9613.1015894271604, 9613.1015894271604, 9613.1015894271604, 9613.1015894271604,
    9613.1015894271604,
  ],
  interestExpense: [
    371.06811413663399, 373.05506032490331, 373.05506032490331, 373.05506032490331,
    373.05506032490331,
  ],
  interestIncome: [
    401.95801108713175, 354.2733630197024, 327.34947836709767, 318.68972386605014,
    363.15666932008304,
  ],
  netIncome: [
    1785.4062296108814, 1001.7425741775993, 864.18805837231787, 1575.0885145359157,
    1607.4039152026849,
  ],
  dividends: [
    836.34062380390947, 469.24783586154535, 404.81295955851681, 737.82116862023088,
    752.95872213823861,
  ],
  endingCash: [
    8405.1389537723535, 7293.5388998017988, 6665.9031124806615, 6464.0313579251051,
    7500.6219792234315,
  ],
} as const;
