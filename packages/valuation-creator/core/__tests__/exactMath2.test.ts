// Tier-1 exact math test, part 2: comps + sensitivity grids + football
// field.
//
// Companion to exactMath.test.ts (part 1: WACC + DCF + DDM headline
// values). This file runs the FULL engine chain for the remaining
// masterprompt outputs - comps-implied valuation ranges, the three DCF
// sensitivity grids, the DDM sensitivity grid, and the seven-bar football
// field - and asserts every value against golden numbers already pinned
// (and traced to the source Excel "Valuation"/"Comps" sheets) by the prior
// work packages' own tests (comps.test.ts, sensitivity.test.ts,
// ddmSensitivity.test.ts, footballField.test.ts). Nothing here is
// reverse-calibrated: every golden below is copied from those files'
// existing assertions, which were themselves derived forward from the
// documented SIA fixtures.
//
// The full engine chain exercised here:
//
//   buildComps(SIA_COMPS_PEERS) -> applyCompsToTarget(_, SIA_COMPS_TARGET)
//                     -> per-multiple implied price ranges
//   waccVsTerminalGrowthGrid / waccVsExitMultipleGrid (sensitivity.ts)
//                     -> DCF Gordon Growth / Exit Multiple grids
//   buildForecast -> ddm -> ddmSensitivityGrid
//                     -> DDM grid (cost of equity x terminal growth rate)
//   footballField({dcfGordonGrowthGrid, dcfExitMultipleGrid, ddmGrid, comps,
//                   targetPrice, marketData})
//                     -> seven-bar football field
//
// Tolerance: ±0.5% relative, OR ±S$0.02 absolute, whichever is looser -
// mirrors exactMath.test.ts's RELATIVE_TOLERANCE but also accommodates
// small absolute golden values (e.g. comps upside deltas) where a pure
// relative bound would be too tight.

import { describe, expect, it } from "vitest";

import { applyCompsToTarget, buildComps } from "../src/comps";
import { ddm } from "../src/ddm";
import { buildForecast } from "../src/forecast";
import { footballField, type FootballFieldResult } from "../src/footballField";
import {
  ddmSensitivityGrid,
  sensitivityRange,
  waccVsEbitdaMarginGrid,
  waccVsExitMultipleGrid,
  waccVsTerminalGrowthGrid,
  type SensitivityGrid,
} from "../src/sensitivity";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import { SIA_COMPS_PEERS } from "./fixtures/siaComps";
import { SIA_COMPS_TARGET } from "./fixtures/siaCompsTarget";
import { siaForecastAssumptions } from "./fixtures/siaForecastAssumptions";
import {
  SIA_SENSITIVITY_BRIDGE,
  SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER,
  SIA_SENSITIVITY_FCFF,
  SIA_SENSITIVITY_GOLDEN,
  SIA_SENSITIVITY_MARGIN_CENTER,
  SIA_SENSITIVITY_TERMINAL_EBITDA,
  SIA_SENSITIVITY_TERMINAL_REVENUE,
  SIA_SENSITIVITY_TGR_CENTER,
  SIA_SENSITIVITY_WACC_CENTER,
} from "./fixtures/siaSensitivity";
import {
  deriveSiaCostOfEquity,
  siaHistoricalPayout,
  siaSharesOutstanding,
  siaSpecialDividendsPerShare,
  siaTerminalGrowthRate,
} from "./fixtures/siaValuation";

import type { MarketData } from "@valuation-bot/contract";

const RELATIVE_TOLERANCE = 0.005;
const ABSOLUTE_TOLERANCE = 0.02;

/** Assert within ±0.5% relative OR ±S$0.02 absolute, whichever is looser. */
function expectWithinTolerance(actual: number, expected: number, label: string): void {
  const absoluteError = Math.abs(actual - expected);
  const relativeError = absoluteError / Math.abs(expected);
  const withinRelative = relativeError <= RELATIVE_TOLERANCE;
  const withinAbsolute = absoluteError <= ABSOLUTE_TOLERANCE;
  expect(
    withinRelative || withinAbsolute,
    `${label}: expected ${expected} within ±${RELATIVE_TOLERANCE * 100}% or ±$${ABSOLUTE_TOLERANCE}, got ${actual} (abs err ${absoluteError}, rel err ${relativeError})`,
  ).toBe(true);
}

function centerCell(grid: SensitivityGrid): number {
  const centerRow = (grid.values.length - 1) / 2;
  const centerCol = (grid.values[0]!.length - 1) / 2;
  const value = grid.values[centerRow]![centerCol]!;
  expect(value).not.toBeNull();
  return value;
}

/** SIA market data (masterprompt2.md §6.2); inlined per footballField.test.ts's precedent. */
const SIA_MARKET_DATA: MarketData = {
  currentPrice: 6.49,
  sharesOutstanding: 3151.9,
  week52High: 7.63,
  week52Low: 6.21,
  marketValueOfDebt: 9510.7,
  cash: 8257.1,
  currency: "SGD",
};

const WACC_AXIS = [0.041, 0.051, 0.061, 0.071, 0.081];
const MARGIN_AXIS = [0.2038, 0.2138, 0.2238, 0.2338, 0.2438];
const MULTIPLE_AXIS = [
  2.7453976643893281, 3.7453976643893281, 4.7453976643893281, 5.7453976643893281,
  6.7453976643893281,
];
const TGR_AXIS = [0.005, 0.01, 0.015, 0.02, 0.025];
// Cost of equity is derived live (deriveSiaCostOfEquity), unlike the other
// fixed fixture-pinned axes, so its axis is built the same way the DDM grid
// itself builds it rather than pinned to a copied literal (a stale copy of
// the ~0.0734793889 golden here previously drifted from the live ~4.5e-9
// past that value and failed a deep-equal check for no functional reason).
const COE_AXIS = sensitivityRange(deriveSiaCostOfEquity(), 0.01, 2);

/** SIA_SENSITIVITY_GRID_AXES: the five axes shared across the grids below. */
const SIA_SENSITIVITY_GRID_AXES = {
  wacc: WACC_AXIS,
  margin: MARGIN_AXIS,
  multiple: MULTIPLE_AXIS,
  terminalGrowthRate: TGR_AXIS,
  costOfEquity: COE_AXIS,
};

describe("comps implied-price ranges (tier 1, documented SIA inputs)", () => {
  const comps = applyCompsToTarget(buildComps(SIA_COMPS_PEERS), SIA_COMPS_TARGET);

  it("implies LTM EV/EBITDA min/median/max prices", () => {
    expectWithinTolerance(comps.evEbitdaLtm.minimum.impliedPrice, 3.7088894852777581, "LTM EV/EBITDA min");
    expectWithinTolerance(comps.evEbitdaLtm.median.impliedPrice, 5.8119840942840115, "LTM EV/EBITDA median");
    expectWithinTolerance(comps.evEbitdaLtm.maximum.impliedPrice, 8.124353104715091, "LTM EV/EBITDA max");
  });

  it("implies LTM P/B min/max prices", () => {
    expectWithinTolerance(comps.pbLtm.minimum.impliedPrice, 3.7511729198939783, "LTM P/B min");
    expectWithinTolerance(comps.pbLtm.maximum.impliedPrice, 6.7154011474410771, "LTM P/B max");
  });

  it("implies LTM P/E min/median/max prices", () => {
    expectWithinTolerance(comps.peLtm.minimum.impliedPrice, 6.614793976362443, "LTM P/E min");
    expectWithinTolerance(comps.peLtm.median.impliedPrice, 7.5094382805271378, "LTM P/E median");
    expectWithinTolerance(comps.peLtm.maximum.impliedPrice, 11.264183397101952, "LTM P/E max");
  });

  it("implies NTM EV/EBITDA min/max prices", () => {
    expectWithinTolerance(comps.evEbitdaNtm.minimum.impliedPrice, 3.9316748383574804, "NTM EV/EBITDA min");
    expectWithinTolerance(comps.evEbitdaNtm.maximum.impliedPrice, 8.9846777961471993, "NTM EV/EBITDA max");
  });

  it("implies NTM P/E min/max prices", () => {
    expectWithinTolerance(comps.peNtm.minimum.impliedPrice, 4.3333727772211184, "NTM P/E min");
    expectWithinTolerance(comps.peNtm.maximum.impliedPrice, 6.2649807733419047, "NTM P/E max");
  });
});

describe("DCF sensitivity grids (tier 1, documented SIA inputs)", () => {
  const waccValues = sensitivityRange(SIA_SENSITIVITY_WACC_CENTER, 0.01, 2);

  const gordonGrid = waccVsTerminalGrowthGrid({
    freeCashFlows: SIA_SENSITIVITY_FCFF,
    waccValues,
    terminalGrowthValues: sensitivityRange(SIA_SENSITIVITY_TGR_CENTER, 0.005, 2),
    ...SIA_SENSITIVITY_BRIDGE,
  });

  const exitMultipleGrid = waccVsExitMultipleGrid({
    freeCashFlows: SIA_SENSITIVITY_FCFF,
    waccValues,
    exitMultipleValues: sensitivityRange(SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER, 1.0, 2),
    terminalEbitda: SIA_SENSITIVITY_TERMINAL_EBITDA,
    ...SIA_SENSITIVITY_BRIDGE,
  });

  it("Gordon Growth grid axes match SIA_SENSITIVITY_GRID_AXES.wacc / .terminalGrowthRate", () => {
    expect(gordonGrid.rows.values.map((v) => Number(v.toFixed(4)))).toEqual(SIA_SENSITIVITY_GRID_AXES.wacc);
    expect(gordonGrid.columns.values.map((v) => Number(v.toFixed(4)))).toEqual(
      SIA_SENSITIVITY_GRID_AXES.terminalGrowthRate,
    );
  });

  it("Gordon Growth centre cell = S$9.8725", () => {
    expectWithinTolerance(centerCell(gordonGrid), 9.8725378340088881, "Gordon Growth centre");
    expectWithinTolerance(centerCell(gordonGrid), SIA_SENSITIVITY_GOLDEN.gordonGrowthCenter, "Gordon Growth centre (fixture golden)");
  });

  it("Exit Multiple grid axes match SIA_SENSITIVITY_GRID_AXES.wacc / .multiple", () => {
    expect(exitMultipleGrid.rows.values.map((v) => Number(v.toFixed(4)))).toEqual(SIA_SENSITIVITY_GRID_AXES.wacc);
    expect(exitMultipleGrid.columns.values).toEqual(SIA_SENSITIVITY_GRID_AXES.multiple);
  });

  it("Exit Multiple centre cell = S$5.9055", () => {
    expectWithinTolerance(centerCell(exitMultipleGrid), 5.9055129469370513, "Exit Multiple centre");
    expectWithinTolerance(centerCell(exitMultipleGrid), SIA_SENSITIVITY_GOLDEN.exitMultipleCenter, "Exit Multiple centre (fixture golden)");
  });

  it("Exit Multiple grid via terminal margin axis matches SIA_SENSITIVITY_GRID_AXES.margin and also centres at S$5.9055", () => {
    const marginGrid = waccVsEbitdaMarginGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues,
      ebitdaMarginValues: sensitivityRange(SIA_SENSITIVITY_MARGIN_CENTER, 0.01, 2),
      terminalRevenue: SIA_SENSITIVITY_TERMINAL_REVENUE,
      exitMultiple: SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER,
      ...SIA_SENSITIVITY_BRIDGE,
    });
    expect(marginGrid.columns.values.map((v) => Number(v.toFixed(4)))).toEqual(
      SIA_SENSITIVITY_GRID_AXES.margin,
    );
    expectWithinTolerance(centerCell(marginGrid), 5.9055129469370513, "Exit Multiple (margin) centre");
  });
});

describe("DDM sensitivity grid (tier 1, documented SIA inputs)", () => {
  const forecast = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");
  const costOfEquity = deriveSiaCostOfEquity();
  const ddmResult = ddm({
    history: siaHistoricalPayout,
    forecastNetIncome: forecast.netIncome.years.map((y) => y.netIncome),
    sharesOutstanding: siaSharesOutstanding,
    specialDividendsPerShare: siaSpecialDividendsPerShare,
    costOfEquity,
    terminalGrowthRate: siaTerminalGrowthRate,
  });

  const ddmGrid = ddmSensitivityGrid({
    totalDividends: ddmResult.years.map((y) => y.totalDividends),
    costOfEquityValues: sensitivityRange(costOfEquity, 0.01, 2),
    terminalGrowthValues: sensitivityRange(siaTerminalGrowthRate, 0.005, 2),
    sharesOutstanding: siaSharesOutstanding,
  });

  it("axes match SIA_SENSITIVITY_GRID_AXES.costOfEquity / .terminalGrowthRate", () => {
    ddmGrid.rows.values.forEach((v, i) =>
      expect(v).toBeCloseTo(SIA_SENSITIVITY_GRID_AXES.costOfEquity[i]!, 9),
    );
    ddmGrid.columns.values.forEach((v, i) =>
      expect(v).toBeCloseTo(SIA_SENSITIVITY_GRID_AXES.terminalGrowthRate[i]!, 9),
    );
  });

  it("centre cell = S$3.8674", () => {
    expectWithinTolerance(centerCell(ddmGrid), 3.8674, "DDM centre");
  });
});

describe("football field (tier 1, seven-bar Excel-parity chart)", () => {
  function buildInput() {
    const waccValues = sensitivityRange(SIA_SENSITIVITY_WACC_CENTER, 0.01, 2);

    const dcfGordonGrowthGrid = waccVsTerminalGrowthGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues,
      terminalGrowthValues: sensitivityRange(SIA_SENSITIVITY_TGR_CENTER, 0.005, 2),
      ...SIA_SENSITIVITY_BRIDGE,
    });

    const dcfExitMultipleGrid = waccVsExitMultipleGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues,
      exitMultipleValues: sensitivityRange(SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER, 1.0, 2),
      terminalEbitda: SIA_SENSITIVITY_TERMINAL_EBITDA,
      ...SIA_SENSITIVITY_BRIDGE,
    });

    const forecast = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");
    const costOfEquity = deriveSiaCostOfEquity();
    const ddmResult = ddm({
      history: siaHistoricalPayout,
      forecastNetIncome: forecast.netIncome.years.map((y) => y.netIncome),
      sharesOutstanding: siaSharesOutstanding,
      specialDividendsPerShare: siaSpecialDividendsPerShare,
      costOfEquity,
      terminalGrowthRate: siaTerminalGrowthRate,
    });
    const ddmGrid = ddmSensitivityGrid({
      totalDividends: ddmResult.years.map((y) => y.totalDividends),
      costOfEquityValues: sensitivityRange(costOfEquity, 0.01, 2),
      terminalGrowthValues: sensitivityRange(siaTerminalGrowthRate, 0.005, 2),
      sharesOutstanding: siaSharesOutstanding,
    });

    const comps = applyCompsToTarget(buildComps(SIA_COMPS_PEERS), SIA_COMPS_TARGET);

    return {
      dcfGordonGrowthGrid,
      dcfExitMultipleGrid,
      ddmGrid,
      comps,
      targetPrice: centerCell(dcfExitMultipleGrid),
      marketData: SIA_MARKET_DATA,
    };
  }

  const result: FootballFieldResult = footballField(buildInput());

  it("produces the seven bars in fixed order", () => {
    expect(result.bars.map((b) => b.method)).toEqual([
      "dcfGordonGrowth",
      "dcfExitMultiple",
      "evEbitdaLtm",
      "pbLtm",
      "evEbitdaNtm",
      "ddm",
      "week52Range",
    ]);
  });

  it("carries the DCF Exit Multiple base-case implied price as targetPrice", () => {
    expectWithinTolerance(result.targetPrice, 5.9055129469370513, "football field targetPrice");
  });

  it("carries the market current price", () => {
    expectWithinTolerance(result.currentPrice, 6.49, "football field currentPrice");
  });

  it("every bar's mean is AVERAGE(min, max) and min <= mean <= max", () => {
    for (const bar of result.bars) {
      expect(bar.mean).toBeCloseTo((bar.min + bar.max) / 2, 9);
      expect(bar.min).toBeLessThanOrEqual(bar.mean);
      expect(bar.mean).toBeLessThanOrEqual(bar.max);
    }
  });

  it("bar 3 (LTM EV/EBITDA) matches the comps-implied min/max", () => {
    const bar = result.bars[2]!;
    expectWithinTolerance(bar.min, 3.7088894852777581, "LTM EV/EBITDA min");
    expectWithinTolerance(bar.max, 8.124353104715091, "LTM EV/EBITDA max");
  });

  it("bar 4 (LTM P/B) matches the comps-implied min/max", () => {
    const bar = result.bars[3]!;
    expectWithinTolerance(bar.min, 3.7511729198939783, "LTM P/B min");
    expectWithinTolerance(bar.max, 6.7154011474410771, "LTM P/B max");
  });

  it("bar 5 (NTM EV/EBITDA) matches the comps-implied min/max", () => {
    const bar = result.bars[4]!;
    expectWithinTolerance(bar.min, 3.9316748383574804, "NTM EV/EBITDA min");
    expectWithinTolerance(bar.max, 8.9846777961471993, "NTM EV/EBITDA max");
  });

  it("bar 7 (52-week range) matches MarketData.week52Low/High", () => {
    const bar = result.bars[6]!;
    expectWithinTolerance(bar.min, 6.21, "52-week min");
    expectWithinTolerance(bar.max, 7.63, "52-week max");
  });
});
