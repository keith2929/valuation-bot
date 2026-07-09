// Tier-2 fixture for the dividend discount model (src/ddm.ts).
//
// Historical payout years are FY2024/FY2025's aggregate common dividends
// paid / net income from `SIA_FINANCIALS` (the same source
// `deriveOperatingAssumptions` reads for its own trailing payoutRatio, see
// forecast.ts), averaging to a payout ratio of 0.46843155912264567.
//
// Forecast net income is `siaNetIncomeExpectedSchedules.netIncome`
// (siaNetIncome.ts) — the below-EBIT schedule's Base-case net income for
// years 1..5, read off the source Excel "3FS" sheet.
//
// Special dividends per share (S$0.10 in each of years 1..3, none
// thereafter) and shares outstanding (3,151.9m) are the source Excel "DDM"
// sheet's inputs. Cost of equity and terminal growth are standalone DDM
// sheet assumptions independent of the WACC/CAPM fixtures used elsewhere in
// this package.
//
// Expected outputs (PV of dividends, terminal value, PV of terminal value,
// equity value, implied price) were computed directly from the "Excel DDM"
// formula this fixture exercises and are asserted to a tight tolerance.

import type { HistoricalPayoutYear } from "../../src/ddm";
import { siaNetIncomeExpectedSchedules } from "./siaNetIncome";

/** Absolute tolerance for comparing aggregate SGD-million values. */
export const DDM_ABSOLUTE_TOLERANCE = 0.001;
/** Absolute tolerance for comparing per-share SGD values. */
export const DDM_PER_SHARE_TOLERANCE = 0.0001;

/** FY2024/FY2025 aggregate common dividends paid / net income, S$ millions. */
export const siaDdmHistory: HistoricalPayoutYear[] = [
  { name: "FY2024", totalDividendsPaid: 1130.2, netIncome: 2674.8 },
  { name: "FY2025", totalDividendsPaid: 1428.8, netIncome: 2778.0 },
];

/** Average of the two historical years' payout ratios. */
export const siaDdmExpectedPayoutRatio = 0.46843155912264567;

/** Forecast net income for years 1..5, aggregate S$ millions ("3FS" row 49). */
export const siaDdmForecastNetIncome = siaNetIncomeExpectedSchedules.netIncome;

/** Special dividends per share for years 1..3 ("DDM" sheet), none thereafter. */
export const siaDdmSpecialDividendsPerShare = [0.1, 0.1, 0.1, 0, 0];

/** Shares outstanding, millions ("DDM" sheet). */
export const siaDdmSharesOutstanding = 3151.9;

/** Cost of equity, decimal ("DDM" sheet). */
export const siaDdmCostOfEquity = 0.073479388906690507;

/** Perpetuity growth rate for dividends, decimal ("DDM" sheet). */
export const siaDdmTerminalGrowthRate = 0.015;

/** Expected headline outputs. */
export const siaDdmExpected = {
  presentValueOfDividends: 2691.1033836148458,
  terminalValue: 13068.760075276292,
  presentValueOfTerminalValue: 9498.6675702418215,
  equityValue: 12189.770953856667,
  impliedPrice: 3.8674358177152404,
} as const;
