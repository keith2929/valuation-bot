// Tier-1 exact math test.
//
// Test tiers in this package:
// - Tier 1 (this file): golden test — the FULL engine is run on documented
//   SIA inputs (transcribed from the source Excel "Valuation"/"3FS" sheets,
//   see fixtures/siaValuation.ts) and the headline outputs must match the
//   sheet's own live formula-cell values within tolerance.
// - Tier 2: layer tests that reproduce independently computed schedules
//   within a defined numeric tolerance (see incomeStatementForecast.test.ts
//   and its siblings, and hamada.test.ts for the peer beta build).
// - Tier 3: end-to-end valuation tests wiring several layers together (see
//   buildForecast.test.ts).
//
// The full engine chain exercised here:
//
//   buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base")
//                     -> FCFF years 1..5, terminal EBITDA, net-income schedule
//   hamadaBetaFromPeers(SIA_BETA_PEERS, siaHamadaTarget)
//                     -> average peer asset beta -> SIA's relevered equity beta
//   costOfEquityCapm / afterTaxCostOfDebt -> market-value-weighted WACC
//   dcf(FCFF @ WACC, bridge)             -> Gordon Growth / Exit Multiple
//                                           equity value per share
//   ddm(payout history, forecast net income @ cost of equity) -> dividend
//                                           value per share
//
// Golden outputs (see fixtures/siaValuation.ts's SIA_VALUATION_GOLDEN, each
// annotated with its Valuation-sheet cell reference): S$9.8725/share from
// the Gordon Growth DCF, S$5.9055/share from the Exit Multiple DCF, and
// S$3.8674/share from the DDM.

import { describe, expect, it } from "vitest";

import { dcf, type DcfResult } from "../src/dcf";
import { ddm, type DdmResult } from "../src/ddm";
import { buildForecast, type ForecastResult } from "../src/forecast";
import { afterTaxCostOfDebt, costOfEquityCapm } from "../src/wacc";
import { hamadaBetaFromPeers, type HamadaFromPeersResult } from "../src/hamada";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import { siaForecastAssumptions } from "./fixtures/siaForecastAssumptions";
import {
  PER_SHARE_DECIMALS,
  RELATIVE_TOLERANCE,
  SIA_BETA_PEERS,
  SIA_VALUATION_GOLDEN,
  siaCapmInputs,
  siaCostOfDebtInputs,
  siaCurrentPrice,
  siaEquityBridge,
  siaExitMultiple,
  siaHamadaTarget,
  siaHistoricalPayout,
  siaSharesOutstanding,
  siaSpecialDividendsPerShare,
  siaTerminalGrowthRate,
  siaWaccMarketValues,
} from "./fixtures/siaValuation";

/** Assert a value is within ±0.5% relative tolerance of its golden. */
function expectWithinTolerance(actual: number, expected: number, label: string): void {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(
    relativeError,
    `${label}: expected ${expected} within ±${RELATIVE_TOLERANCE * 100}%, got ${actual} (rel err ${relativeError})`,
  ).toBeLessThan(RELATIVE_TOLERANCE);
}

/**
 * Assert a per-share output matches its golden value digit-for-digit at
 * the stated precision.
 */
function expectExactPerShare(actual: number, golden: string, label: string): void {
  expect(
    actual.toFixed(PER_SHARE_DECIMALS),
    `${label}: expected exactly ${golden} (to ${PER_SHARE_DECIMALS} dp), got ${actual}`,
  ).toBe(golden);
}

describe("full engine exact math (tier 1, documented SIA inputs)", () => {
  const forecast: ForecastResult = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");

  const hamada: HamadaFromPeersResult = hamadaBetaFromPeers(SIA_BETA_PEERS, siaHamadaTarget);
  const costOfEquity = costOfEquityCapm({
    riskFreeRate: siaCapmInputs.riskFreeRate,
    equityBeta: hamada.releveredEquityBeta,
    equityRiskPremium: siaCapmInputs.equityRiskPremium,
  });
  const preTaxCostOfDebt = siaCostOfDebtInputs.interestExpense / siaCostOfDebtInputs.marketValueOfDebt;
  const afterTaxKd = afterTaxCostOfDebt(preTaxCostOfDebt, siaCostOfDebtInputs.taxRate);
  const totalCapital = siaWaccMarketValues.marketValueOfEquity + siaWaccMarketValues.marketValueOfDebt;
  const weightOfEquity = siaWaccMarketValues.marketValueOfEquity / totalCapital;
  const weightOfDebt = siaWaccMarketValues.marketValueOfDebt / totalCapital;
  const waccValue = weightOfEquity * costOfEquity + weightOfDebt * afterTaxKd;

  const dcfResult: DcfResult = dcf({
    ...siaEquityBridge,
    freeCashFlows: forecast.drivers.freeCashFlows,
    discountRate: waccValue,
    terminalGrowthRate: siaTerminalGrowthRate,
    exitMultiple: siaExitMultiple,
    terminalMetric: forecast.drivers.terminalEBITDA,
    currentPrice: siaCurrentPrice,
  });

  const ddmResult: DdmResult = ddm({
    history: siaHistoricalPayout,
    forecastNetIncome: forecast.netIncome.years.map((y) => y.netIncome),
    sharesOutstanding: siaSharesOutstanding,
    specialDividendsPerShare: siaSpecialDividendsPerShare,
    costOfEquity,
    terminalGrowthRate: siaTerminalGrowthRate,
  });

  it("reproduces the documented SIA beta build (average asset beta, relevered equity beta)", () => {
    expectWithinTolerance(hamada.averageAssetBeta, SIA_VALUATION_GOLDEN.avgAssetBeta, "average asset beta");
    expectWithinTolerance(hamada.releveredEquityBeta, SIA_VALUATION_GOLDEN.releveredBeta, "relevered equity beta");
    // Qantas is the documented outlier exclusion.
    expect(hamada.includedCount).toBe(6);
  });

  it("reproduces the documented cost of equity, after-tax cost of debt, and WACC", () => {
    expectWithinTolerance(costOfEquity, SIA_VALUATION_GOLDEN.costOfEquity, "cost of equity (Ke)");
    expectWithinTolerance(afterTaxKd, SIA_VALUATION_GOLDEN.afterTaxCostOfDebt, "after-tax cost of debt");
    expectWithinTolerance(waccValue, SIA_VALUATION_GOLDEN.wacc, "WACC");
  });

  it("discounts FCFF at a WACC below the CAPM cost of equity used for dividends", () => {
    // With debt in the structure the blended rate must sit between the
    // after-tax cost of debt and the cost of equity; a wiring mistake that
    // discounted FCFF at the equity rate (or dividends at WACC) breaks this.
    expect(waccValue).toBeGreaterThan(afterTaxKd);
    expect(waccValue).toBeLessThan(costOfEquity);
  });

  it("wires the forecast layer into the DCF unchanged", () => {
    expect(dcfResult.years.map((y) => y.freeCashFlow)).toEqual(forecast.drivers.freeCashFlows);
    expect(dcfResult.exitMultiple.terminal.terminalValue).toBe(
      siaExitMultiple * forecast.drivers.terminalEBITDA,
    );
  });

  it("matches the documented Gordon Growth DCF chain", () => {
    expectWithinTolerance(
      dcfResult.presentValueOfForecast,
      SIA_VALUATION_GOLDEN.presentValueOfForecastFcff,
      "ΣPV FCFF",
    );
    expectWithinTolerance(
      dcfResult.gordonGrowth.terminal.terminalValue,
      SIA_VALUATION_GOLDEN.gordonGrowth.terminalValue,
      "Gordon Growth terminal value",
    );
    expectWithinTolerance(
      dcfResult.gordonGrowth.terminal.presentValueOfTerminalValue,
      SIA_VALUATION_GOLDEN.gordonGrowth.presentValueOfTerminalValue,
      "PV of Gordon Growth terminal value",
    );
    expectWithinTolerance(
      dcfResult.gordonGrowth.enterpriseValue,
      SIA_VALUATION_GOLDEN.gordonGrowth.enterpriseValue,
      "Gordon Growth enterprise value",
    );
    expectWithinTolerance(
      dcfResult.gordonGrowth.equityValue,
      SIA_VALUATION_GOLDEN.gordonGrowth.equityValue,
      "Gordon Growth equity value",
    );
    expectExactPerShare(
      dcfResult.gordonGrowth.equityValuePerShare,
      SIA_VALUATION_GOLDEN.gordonGrowth.equityValuePerShare,
      "DCF (Gordon Growth) equity value per share",
    );
  });

  it("matches the documented Exit Multiple DCF chain", () => {
    expectWithinTolerance(
      dcfResult.exitMultiple.terminal.terminalValue,
      SIA_VALUATION_GOLDEN.exitMultiple.terminalValue,
      "Exit Multiple terminal value",
    );
    expectWithinTolerance(
      dcfResult.exitMultiple.terminal.presentValueOfTerminalValue,
      SIA_VALUATION_GOLDEN.exitMultiple.presentValueOfTerminalValue,
      "PV of Exit Multiple terminal value",
    );
    expectWithinTolerance(
      dcfResult.exitMultiple.enterpriseValue,
      SIA_VALUATION_GOLDEN.exitMultiple.enterpriseValue,
      "Exit Multiple enterprise value",
    );
    expectWithinTolerance(
      dcfResult.exitMultiple.equityValue,
      SIA_VALUATION_GOLDEN.exitMultiple.equityValue,
      "Exit Multiple equity value",
    );
    expectExactPerShare(
      dcfResult.exitMultiple.equityValuePerShare,
      SIA_VALUATION_GOLDEN.exitMultiple.equityValuePerShare,
      "DCF (Exit Multiple) equity value per share",
    );
    expectWithinTolerance(
      dcfResult.exitMultiple.upside,
      SIA_VALUATION_GOLDEN.exitMultiple.upside,
      "Exit Multiple upside",
    );
  });

  it("matches the documented DDM chain", () => {
    expectWithinTolerance(ddmResult.equityValue, SIA_VALUATION_GOLDEN.ddm.equityValue, "DDM equity value");
    expectExactPerShare(
      ddmResult.impliedPrice,
      SIA_VALUATION_GOLDEN.ddm.impliedPrice,
      "DDM implied price per share",
    );
  });
});
