// Tier-3 fixture for the balance-sheet and cash-flow forecast (src/forecast.ts:
// buildBalanceSheetCashFlowForecast) — the closing block of the source Excel
// "3FS" sheet.
//
// This forward consumes every upstream schedule rather than re-deriving any of
// them, so the fixture wires the actual builder outputs together:
// - net income / dividends / debt come from `buildNetIncomeForecast(siaNetIncomeInput)`,
// - D&A, capex and ending net PP&E from `buildPpeSchedule(siaPpeScheduleInput)`,
// - changeInNWC and the current asset/liability lines (receivables, inventory,
//   prepaid, accountsPayable, accrued, unearnedRevenue, otherCurrentLiabilities)
//   from `buildWorkingCapitalSchedule(siaWorkingCapitalInput)`.
//
// The held-flat balance-sheet anchors are the FY2025 balance-sheet levels in
// siaAssumptions.ts (`SIA_FINANCIALS.balanceSheet`), read at the last index.
// `openingCash` (8257.1) and `openingRetainedEarnings` (8473.1) are the FY2025
// cash and retained-earnings levels; `baseTotalDebt` (9510.7) is the FY2025
// total debt (currentPortionLTDebt 2213.4 + longTermDebt 7297.3).
//
// Two FY2025 reconciling constants make the projected totals tie back to the
// Excel:
// - `SIA_FY25_TRADING_ASSET_SECURITIES` (33.5) = FY2025 totalAssets (43086.8)
//   minus the sum of the mapped asset lines the contract does carry. The source
//   model's "Trading Asset Securities" line is absent from the
//   `FinancialStatements` contract, so it is carried flat as a reconciling asset.
// - `SIA_FY25_BOOK_VALUE_RESIDUAL` (2.2) = FY2025 bookValueOfEquity (15656.2)
//   minus commonEquity (7180.9) minus retainedEarnings (8473.1).
//
// Expected ending-cash and totalAssets figures were read off the sheet; the
// balance-sheet identity (totalAssets == totalLiabilities + totalEquity) holds
// to floating-point precision and must reproduce within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS.

import {
  buildNetIncomeForecast,
  buildPpeSchedule,
  buildWorkingCapitalSchedule,
} from "../../src/forecast";
import type { BalanceSheetCashFlowInput } from "../../src/forecast";
import { SIA_FINANCIALS } from "./siaAssumptions";
import { siaNetIncomeInput } from "./siaNetIncome";
import { siaPpeScheduleInput } from "./siaPpeSchedule";
import { siaWorkingCapitalInput } from "./siaWorkingCapital";

/** Absolute tolerance for comparing schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

const bs = SIA_FINANCIALS.balanceSheet;
const last = <T>(series: readonly T[]): T => series[series.length - 1]!;

/** FY2025 year-end cash (beginningCash for FY26). */
export const SIA_FY25_CASH = last(bs.cash); // 8257.1

/** FY2025 retained earnings (RE_0 for the rollforward). */
export const SIA_FY25_RETAINED_EARNINGS = last(bs.retainedEarnings); // 8473.1

/** FY2025 total debt (currentPortionLTDebt 2213.4 + longTermDebt 7297.3). */
export const SIA_FY25_TOTAL_DEBT = last(bs.currentPortionLTDebt) + last(bs.longTermDebt); // 9510.7

/**
 * FY2025 reconciling asset: totalAssets minus the sum of the mapped asset
 * lines the `FinancialStatements` contract carries. Equals the source model's
 * "Trading Asset Securities" line (33.5), which the contract omits.
 */
export const SIA_FY25_TRADING_ASSET_SECURITIES =
  last(bs.totalAssets) -
  (last(bs.cash) +
    last(bs.shortTermInvestments) +
    last(bs.receivables) +
    last(bs.inventory) +
    last(bs.prepaid) +
    last(bs.otherCurrentAssets) +
    last(bs.netPPE) +
    last(bs.longTermInvestments) +
    last(bs.goodwill) +
    last(bs.intangibles) +
    last(bs.otherLTAssets)); // 33.5

/**
 * FY2025 residual reconciling bookValueOfEquity != commonEquity +
 * retainedEarnings (15656.2 - 7180.9 - 8473.1 = 2.2), held flat.
 */
export const SIA_FY25_BOOK_VALUE_RESIDUAL =
  last(bs.bookValueOfEquity) - last(bs.commonEquity) - last(bs.retainedEarnings); // 2.2

const netIncome = buildNetIncomeForecast(siaNetIncomeInput).years;
const ppe = buildPpeSchedule(siaPpeScheduleInput).years;
const workingCapital = buildWorkingCapitalSchedule(siaWorkingCapitalInput).years;

export const siaBalanceSheetCashFlowInput: BalanceSheetCashFlowInput = {
  openingCash: SIA_FY25_CASH,
  baseTotalDebt: SIA_FY25_TOTAL_DEBT,
  openingRetainedEarnings: SIA_FY25_RETAINED_EARNINGS,

  shortTermInvestments: last(bs.shortTermInvestments),
  tradingAssetSecurities: SIA_FY25_TRADING_ASSET_SECURITIES,
  otherCurrentAssets: last(bs.otherCurrentAssets),
  longTermInvestments: last(bs.longTermInvestments),
  goodwill: last(bs.goodwill),
  intangibles: last(bs.intangibles),
  otherLTAssets: last(bs.otherLTAssets),

  currentLeases: last(bs.currentLeases),
  taxesPayable: last(bs.taxesPayable),
  longTermLeases: last(bs.longTermLeases),
  pensionOPEB: last(bs.pensionOPEB),
  deferredTaxLiability: last(bs.deferredTaxLiability),
  otherNonCurrentLiabilities: last(bs.otherNonCurrentLiabilities),

  commonEquity: last(bs.commonEquity),
  bookValueResidual: SIA_FY25_BOOK_VALUE_RESIDUAL,
  minorityInterest: last(bs.minorityInterest),

  years: netIncome.map((year, i) => ({
    netIncome: year.netIncome,
    totalDividends: year.dividends,
    depreciationAndAmortisation: ppe[i]!.depreciationAndAmortisation,
    changeInNetWorkingCapital: workingCapital[i]!.changeInNetWorkingCapital,
    capitalExpenditure: ppe[i]!.capitalExpenditure,
    debt: year.debt,
    netPPE: ppe[i]!.endingNetPPE,
    receivables: workingCapital[i]!.receivables,
    inventory: workingCapital[i]!.inventory,
    prepaid: workingCapital[i]!.prepaid,
    accountsPayable: workingCapital[i]!.accountsPayable,
    accrued: workingCapital[i]!.accrued,
    unearnedRevenue: workingCapital[i]!.unearnedRevenue,
    otherCurrentLiabilities: workingCapital[i]!.otherCurrentLiabilities,
  })),
};

/**
 * Expected cash-flow and balance-sheet lines for years FY26..FY30 (1..5), the
 * "3FS" sheet's closing block. Constant debt sits entirely in long-term debt;
 * the FY26 debt issuance is the only non-zero financing draw.
 *
 * `debtIssued` and `endingCash` are read directly off the sheet; the FY26
 * `totalAssets` (44537.327512447562) is the sheet's independent anchor. The
 * FY27..FY30 `totalAssets` are regression values that the balance-sheet
 * identity (totalAssets == totalLiabilities + totalEquity, asserted separately)
 * pins down exactly.
 */
export const siaBalanceSheetCashFlowExpectedSchedules = {
  /** debt_t - debt_{t-1}: FY26 = 9613.10... - 9510.7, flat (0) thereafter. */
  debtIssued: [102.40158942715971, 0, 0, 0, 0],
  endingCash: [
    8405.1389537723535, 7293.5388998017988, 6665.9031124806615, 6464.0313579251051,
    7500.6219792234315,
  ],
  totalAssets: [
    44537.327512447555, 45738.10072324397, 46550.025650951095, 47285.222386685135,
    48387.836369603116,
  ],
} as const;

/** FY26 (year 1) total-assets spot check (must equal totalLiabilities + totalEquity). */
export const SIA_FY26_TOTAL_ASSETS = 44537.327512447562;
