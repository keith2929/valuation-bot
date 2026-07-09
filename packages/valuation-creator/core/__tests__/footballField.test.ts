// Tier-1/2 tests for footballField: the seven-bar Excel-parity football
// field, assembled from the DCF/DDM sensitivity grids (sensitivity.ts) and
// the comps-implied valuation (comps.ts).

import { describe, expect, it } from "vitest";

import { applyCompsToTarget, buildComps } from "../src/comps";
import { ddm } from "../src/ddm";
import { buildForecast } from "../src/forecast";
import {
  footballField,
  type FootballFieldResult,
} from "../src/footballField";
import {
  ddmSensitivityGrid,
  sensitivityRange,
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
  SIA_SENSITIVITY_TERMINAL_EBITDA,
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

const TOLERANCE = 1e-9;

function expectClose(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThan(
    TOLERANCE,
  );
}

function centerCell(grid: SensitivityGrid): number {
  const centerRow = (grid.values.length - 1) / 2;
  const centerCol = (grid.values[0]!.length - 1) / 2;
  return grid.values[centerRow]![centerCol]!;
}

/** SIA market data (masterprompt2.md §6.2), inlined here since it lives one package up. */
const SIA_MARKET_DATA: MarketData = {
  currentPrice: 6.49,
  sharesOutstanding: 3151.9,
  week52High: 7.63,
  week52Low: 6.21,
  marketValueOfDebt: 9510.7,
  cash: 8257.1,
  currency: "SGD",
};

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

describe("footballField (seven-bar Excel-parity chart)", () => {
  const input = buildInput();
  const result: FootballFieldResult = footballField(input);

  it("produces one bar per method, in the fixed order", () => {
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

  it("every bar's mean is AVERAGE(min, max)", () => {
    for (const bar of result.bars) {
      expect(bar.mean).toBeCloseTo((bar.min + bar.max) / 2, 12);
      expect(bar.min).toBeLessThanOrEqual(bar.max);
    }
  });

  it("carries the DCF Exit Multiple base-case implied price as targetPrice", () => {
    expectClose(result.targetPrice, 5.9055129469370513, "targetPrice");
  });

  it("carries the market current price", () => {
    expect(result.currentPrice).toBe(6.49);
  });

  it("bar 3 (LTM EV/EBITDA) matches the comps-implied min/max", () => {
    const bar = result.bars[2]!;
    expectClose(bar.min, 3.7088894852777581, "LTM EV/EBITDA min");
    expectClose(bar.max, 8.124353104715091, "LTM EV/EBITDA max");
    expectClose(bar.mean, 5.9166212949964245, "LTM EV/EBITDA mean");
  });

  it("bar 4 (LTM P/B) matches the comps-implied min/max", () => {
    const bar = result.bars[3]!;
    expectClose(bar.min, 3.7511729198939783, "LTM P/B min");
    expectClose(bar.max, 6.7154011474410771, "LTM P/B max");
    expectClose(bar.mean, 5.2332870336675277, "LTM P/B mean");
  });

  it("bar 5 (NTM EV/EBITDA) matches the comps-implied min/max", () => {
    const bar = result.bars[4]!;
    expectClose(bar.min, 3.9316748383574804, "NTM EV/EBITDA min");
    expectClose(bar.max, 8.9846777961471993, "NTM EV/EBITDA max");
    expectClose(bar.mean, 6.4581763172523399, "NTM EV/EBITDA mean");
  });

  it("bar 7 (52-week range) matches MarketData.week52Low/High", () => {
    const bar = result.bars[6]!;
    expect(bar.min).toBe(6.21);
    expect(bar.max).toBe(7.63);
    expect(bar.mean).toBeCloseTo(6.92, 9);
  });

  it("bars 1/2/6 span a valid min <= mean <= max range from their grids", () => {
    const [gordon, exit, , , , ddmBar] = result.bars;
    expect(gordon!.min).toBeLessThanOrEqual(gordon!.mean);
    expect(gordon!.mean).toBeLessThanOrEqual(gordon!.max);
    expect(exit!.min).toBeLessThanOrEqual(exit!.mean);
    expect(exit!.mean).toBeLessThanOrEqual(exit!.max);
    expect(ddmBar!.min).toBeLessThanOrEqual(ddmBar!.mean);
    expect(ddmBar!.mean).toBeLessThanOrEqual(ddmBar!.max);
  });

  it("throws when a grid has no valid cells", () => {
    const emptyGrid: SensitivityGrid = {
      rows: { label: "WACC", values: [0.06] },
      columns: { label: "Terminal growth rate", values: [0.06] },
      values: [[null]],
    };
    expect(() => footballField({ ...input, dcfGordonGrowthGrid: emptyGrid })).toThrow(RangeError);
  });
});
