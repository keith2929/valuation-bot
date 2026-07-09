// Unit tests for ddmSensitivityGrid: cost of equity (rows) x terminal
// growth rate (columns), mirroring waccVsTerminalGrowthGrid's shape but for
// the DDM's aggregate dividend stream instead of FCFF.

import { describe, expect, it } from "vitest";

import { ddm } from "../src/ddm";
import { ddmSensitivityGrid, type SensitivityGrid } from "../src/sensitivity";
import { buildForecast } from "../src/forecast";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import { siaForecastAssumptions } from "./fixtures/siaForecastAssumptions";
import {
  deriveSiaCostOfEquity,
  siaHistoricalPayout,
  siaSharesOutstanding,
  siaSpecialDividendsPerShare,
  siaTerminalGrowthRate,
} from "./fixtures/siaValuation";

const COST_OF_EQUITY_VALUES = [
  0.053479388906690512, 0.063479388906690512, 0.073479388906690507, 0.083479388906690502,
  0.093479388906690497,
];
const TERMINAL_GROWTH_VALUES = [0.005, 0.01, 0.015, 0.02, 0.025];
const CENTER_GOLDEN = 3.8674;
const TOLERANCE = 0.0001;

function siaTotalDividends(): readonly number[] {
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
  return ddmResult.years.map((y) => y.totalDividends);
}

function centerCell(grid: SensitivityGrid): number | null {
  const centerRow = (grid.values.length - 1) / 2;
  const centerCol = (grid.values[0]!.length - 1) / 2;
  return grid.values[centerRow]![centerCol]!;
}

describe("ddmSensitivityGrid", () => {
  const totalDividends = siaTotalDividends();
  const grid = ddmSensitivityGrid({
    totalDividends,
    costOfEquityValues: COST_OF_EQUITY_VALUES,
    terminalGrowthValues: TERMINAL_GROWTH_VALUES,
    sharesOutstanding: siaSharesOutstanding,
  });

  it("axes match the requested cost-of-equity rows / TGR columns", () => {
    expect(grid.rows.values).toEqual(COST_OF_EQUITY_VALUES);
    expect(grid.columns.values).toEqual(TERMINAL_GROWTH_VALUES);
  });

  it("centre cell equals S$3.8674 to ±0.0001", () => {
    const center = centerCell(grid);
    expect(center).not.toBeNull();
    expect(Math.abs(center! - CENTER_GOLDEN)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("is null wherever the terminal growth rate is >= cost of equity", () => {
    const wideGrid = ddmSensitivityGrid({
      totalDividends,
      costOfEquityValues: [0.02],
      terminalGrowthValues: [0.01, 0.02, 0.03],
      sharesOutstanding: siaSharesOutstanding,
    });
    expect(wideGrid.values[0]).toEqual([expect.any(Number), null, null]);
  });

  it("is monotonically decreasing in cost of equity for every growth-rate column", () => {
    for (let col = 0; col < grid.columns.values.length; col++) {
      const column = grid.values.map((row) => row[col]);
      for (let row = 1; row < column.length; row++) {
        const prev = column[row - 1];
        const curr = column[row];
        if (prev === null || curr === null) continue;
        expect(curr).toBeLessThan(prev);
      }
    }
  });

  it("throws when the dividend stream is empty", () => {
    expect(() =>
      ddmSensitivityGrid({
        totalDividends: [],
        costOfEquityValues: COST_OF_EQUITY_VALUES,
        terminalGrowthValues: TERMINAL_GROWTH_VALUES,
        sharesOutstanding: siaSharesOutstanding,
      }),
    ).toThrow(RangeError);
  });

  it("throws when sharesOutstanding is not positive", () => {
    expect(() =>
      ddmSensitivityGrid({
        totalDividends,
        costOfEquityValues: COST_OF_EQUITY_VALUES,
        terminalGrowthValues: TERMINAL_GROWTH_VALUES,
        sharesOutstanding: 0,
      }),
    ).toThrow(RangeError);
  });
});
