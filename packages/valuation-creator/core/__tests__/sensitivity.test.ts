// Tier-1 golden test for the three DCF sensitivity grids against the
// source Excel model's "Valuation" sheet (rows 88-105). See
// fixtures/siaSensitivity.ts for why the golden values are read from the
// live formula cells rather than the workbook's stale cached data-table
// bodies.

import { describe, expect, it } from "vitest";

import {
  sensitivityRange,
  waccVsEbitdaMarginGrid,
  waccVsExitMultipleGrid,
  waccVsTerminalGrowthGrid,
  type SensitivityGrid,
} from "../src/sensitivity";
import {
  SENSITIVITY_TOLERANCE,
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

/** WACC rows [center - 2*step .. center + 2*step], step 1% -> rounds to §6.6's [0.041, 0.051, 0.061, 0.071, 0.081]. */
const waccValues = sensitivityRange(SIA_SENSITIVITY_WACC_CENTER, 0.01, 2);

function centerCell(grid: SensitivityGrid): number | null {
  const centerRow = (grid.values.length - 1) / 2;
  const centerCol = (grid.values[0]!.length - 1) / 2;
  return grid.values[centerRow]![centerCol]!;
}

describe("waccVsTerminalGrowthGrid (Gordon Growth, tier 1 golden)", () => {
  const terminalGrowthValues = sensitivityRange(SIA_SENSITIVITY_TGR_CENTER, 0.005, 2);
  const grid = waccVsTerminalGrowthGrid({
    freeCashFlows: SIA_SENSITIVITY_FCFF,
    waccValues,
    terminalGrowthValues,
    ...SIA_SENSITIVITY_BRIDGE,
  });

  it("axes match SIA_SENSITIVITY_GRID_AXES.dcfGordon (WACC rows / TGR cols)", () => {
    expect(grid.rows.values.map((v) => Number(v.toFixed(4)))).toEqual([
      0.041, 0.051, 0.061, 0.071, 0.081,
    ]);
    expect(grid.columns.values.map((v) => Number(v.toFixed(4)))).toEqual([
      0.005, 0.01, 0.015, 0.02, 0.025,
    ]);
  });

  it("centre cell equals the base implied Gordon Growth price to ±0.0001", () => {
    const center = centerCell(grid);
    expect(center).not.toBeNull();
    expect(Math.abs(center! - SIA_SENSITIVITY_GOLDEN.gordonGrowthCenter)).toBeLessThanOrEqual(
      SENSITIVITY_TOLERANCE,
    );
  });

  it("is monotonically decreasing in WACC for every growth-rate column", () => {
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

  it("is null where terminal growth >= WACC", () => {
    const wideGrowth = sensitivityRange(0.08, 0.02, 1); // [0.06, 0.08, 0.10]
    const wideGrid = waccVsTerminalGrowthGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues: [0.09],
      terminalGrowthValues: wideGrowth,
      ...SIA_SENSITIVITY_BRIDGE,
    });
    expect(wideGrid.values[0]).toEqual([expect.any(Number), expect.any(Number), null]);
  });
});

describe("waccVsEbitdaMarginGrid (Exit Multiple via terminal margin, tier 1 golden)", () => {
  const ebitdaMarginValues = sensitivityRange(SIA_SENSITIVITY_MARGIN_CENTER, 0.01, 2);
  const grid = waccVsEbitdaMarginGrid({
    freeCashFlows: SIA_SENSITIVITY_FCFF,
    waccValues,
    ebitdaMarginValues,
    terminalRevenue: SIA_SENSITIVITY_TERMINAL_REVENUE,
    exitMultiple: SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER,
    ...SIA_SENSITIVITY_BRIDGE,
  });

  it("axes match SIA_SENSITIVITY_GRID_AXES.dcfExitMultiple (WACC rows / margin cols)", () => {
    expect(grid.rows.values.map((v) => Number(v.toFixed(4)))).toEqual([
      0.041, 0.051, 0.061, 0.071, 0.081,
    ]);
    expect(grid.columns.values.map((v) => Number(v.toFixed(4)))).toEqual([
      0.2038, 0.2138, 0.2238, 0.2338, 0.2438,
    ]);
  });

  it("centre cell equals the base implied Exit Multiple price to ±0.0001", () => {
    const center = centerCell(grid);
    expect(center).not.toBeNull();
    expect(Math.abs(center! - SIA_SENSITIVITY_GOLDEN.exitMultipleCenter)).toBeLessThanOrEqual(
      SENSITIVITY_TOLERANCE,
    );
  });

  it("is monotonically decreasing in WACC for every margin column", () => {
    for (let col = 0; col < grid.columns.values.length; col++) {
      const column = grid.values.map((row) => row[col]);
      for (let row = 1; row < column.length; row++) {
        expect(column[row]).toBeLessThan(column[row - 1]!);
      }
    }
  });

  it("holds the explicit FCFF forecast fixed across columns (only the terminal value moves)", () => {
    // Re-run with a single margin column; the centre-row centre-cell should
    // be unaffected by this axis truncation since the FCFF PV term is
    // independent of the margin axis (it is computed once per row).
    const singleColumnGrid = waccVsEbitdaMarginGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues: [SIA_SENSITIVITY_WACC_CENTER],
      ebitdaMarginValues: [SIA_SENSITIVITY_MARGIN_CENTER],
      terminalRevenue: SIA_SENSITIVITY_TERMINAL_REVENUE,
      exitMultiple: SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER,
      ...SIA_SENSITIVITY_BRIDGE,
    });
    expect(singleColumnGrid.values[0]![0]).toBeCloseTo(centerCell(grid)!, 9);
  });
});

describe("waccVsExitMultipleGrid (Exit Multiple via multiple, tier 1 golden)", () => {
  const exitMultipleValues = sensitivityRange(SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER, 1.0, 2);
  const grid = waccVsExitMultipleGrid({
    freeCashFlows: SIA_SENSITIVITY_FCFF,
    waccValues,
    exitMultipleValues,
    terminalEbitda: SIA_SENSITIVITY_TERMINAL_EBITDA,
    ...SIA_SENSITIVITY_BRIDGE,
  });

  it("axes match SIA_SENSITIVITY_GRID_AXES.dcfExitMultiple.exitMultipleCols (WACC rows / multiple cols)", () => {
    expect(grid.rows.values.map((v) => Number(v.toFixed(4)))).toEqual([
      0.041, 0.051, 0.061, 0.071, 0.081,
    ]);
    expect(grid.columns.values).toEqual([
      2.7453976643893281, 3.7453976643893281, 4.7453976643893281, 5.7453976643893281,
      6.7453976643893281,
    ]);
  });

  it("centre cell equals the base implied Exit Multiple price to ±0.0001", () => {
    const center = centerCell(grid);
    expect(center).not.toBeNull();
    expect(Math.abs(center! - SIA_SENSITIVITY_GOLDEN.exitMultipleCenter)).toBeLessThanOrEqual(
      SENSITIVITY_TOLERANCE,
    );
  });

  it("agrees with waccVsEbitdaMarginGrid at the shared centre point (same fixed-FCFF pattern)", () => {
    const marginGrid = waccVsEbitdaMarginGrid({
      freeCashFlows: SIA_SENSITIVITY_FCFF,
      waccValues: [SIA_SENSITIVITY_WACC_CENTER],
      ebitdaMarginValues: [SIA_SENSITIVITY_MARGIN_CENTER],
      terminalRevenue: SIA_SENSITIVITY_TERMINAL_REVENUE,
      exitMultiple: SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER,
      ...SIA_SENSITIVITY_BRIDGE,
    });
    expect(centerCell(grid)!).toBeCloseTo(marginGrid.values[0]![0]!, 9);
  });

  it("is monotonically decreasing in WACC for every multiple column", () => {
    for (let col = 0; col < grid.columns.values.length; col++) {
      const column = grid.values.map((row) => row[col]);
      for (let row = 1; row < column.length; row++) {
        expect(column[row]).toBeLessThan(column[row - 1]!);
      }
    }
  });
});
