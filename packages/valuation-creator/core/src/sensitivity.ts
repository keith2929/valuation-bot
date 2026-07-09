// 2D sensitivity grids of DCF value per share.
//
// A sensitivity table shows how the per-share value from a DCF moves as two
// inputs are varied together, holding everything else constant. This module
// mirrors the three data tables of the source Excel model's "Valuation"
// sheet, each a plain data structure (no rendering):
//
// 1. WACC vs terminal growth rate (Gordon Growth). The explicit free cash
//    flow forecast is fixed; each cell re-discounts it at the row's WACC
//    and recomputes the Gordon Growth terminal value at the column's growth
//    rate. Cells where the growth rate is not strictly below the WACC are
//    undefined (the perpetuity diverges) and are returned as null.
//
// 2. WACC vs terminal EBITDA margin (Exit Multiple). The explicit FCFF
//    forecast is the SAME fixed stream as grid 1 - only the terminal value
//    varies, via a fixed terminal-year revenue and a fixed exit multiple:
//
//      TV = exitMultiple * (terminalRevenue * ebitdaMargin)
//
// 3. WACC vs exit multiple (Exit Multiple). Same fixed FCFF stream again;
//    only the exit multiple varies against a fixed terminal-year EBITDA:
//
//      TV = exitMultiple * terminalEbitda
//
// All three grids share the discounting and equity-bridge conventions of
// dcf.ts: mid-year discounting of the explicit forecast, a terminal value
// discounted over N - 0.5 periods (Gordon Growth and Exit Multiple alike),
// and equityValue = EV - netDebt - minorityInterest - preferredEquity
//                       + nonOperatingAssets.
//
// By convention WACC is always the row axis and the other input is the
// column axis, so values[r][c] pairs waccValues[r] with the c-th column
// value.

import {
  enterpriseToEquityValue,
  exitMultipleTerminalValue,
  gordonGrowthTerminalValue,
  midYearDiscountFactor,
  type EquityBridgeInput,
} from "./dcf";

// 4. Cost of equity vs terminal growth rate (DDM). Mirrors grid 1's Gordon
//    Growth shape but for ddm.ts: the fixed aggregate dividend stream is
//    re-discounted at the row's cost of equity over mid-year periods
//    0.5..N-0.5, and the terminal value grows the final year's total
//    dividend at the column's growth rate, discounted over N - 0.5 periods -
//    then divided by shares outstanding (no enterprise-to-equity bridge,
//    dividends already accrue to equity). Cells where growth >= cost of
//    equity are null.

export interface SensitivityAxis {
  /** Human-readable axis label, e.g. "WACC" or "EBITDA margin". */
  label: string;
  /** Axis values in grid order (as decimals, e.g. 0.09 for 9%). */
  values: number[];
}

export interface SensitivityGrid {
  /** Row axis; always WACC for the grids in this module. */
  rows: SensitivityAxis;
  /** Column axis: terminal growth rate or EBITDA margin. */
  columns: SensitivityAxis;
  /**
   * Per-share values, indexed values[row][column]. A cell is null where the
   * combination is undefined (e.g. terminal growth >= WACC, or a negative
   * terminal EBITDA under an exit multiple).
   */
  values: (number | null)[][];
}

export interface WaccVsTerminalGrowthInput extends EquityBridgeInput {
  /** FCFF forecast for years 1..N, in currency units; must be non-empty. */
  freeCashFlows: readonly number[];
  /** WACC values for the row axis, as decimals; each must be > 0. */
  waccValues: readonly number[];
  /** Terminal growth rates for the column axis, as decimals. */
  terminalGrowthValues: readonly number[];
}

export interface FixedFcffInput extends EquityBridgeInput {
  /**
   * FCFF forecast for years 1..N, in currency units; must be non-empty.
   * FIXED across every cell of the grid - only the terminal value moves.
   */
  freeCashFlows: readonly number[];
  /** WACC values for the row axis, as decimals; each must be > 0. */
  waccValues: readonly number[];
}

export interface WaccVsEbitdaMarginInput extends FixedFcffInput {
  /** EBITDA margins for the column axis, as decimals, e.g. 0.25 for 25%. */
  ebitdaMarginValues: readonly number[];
  /**
   * Fixed terminal-year (year N) revenue; must be >= 0. Combined with each
   * column's margin to give the terminal metric: terminalRevenue * margin.
   */
  terminalRevenue: number;
  /** Fixed EV/EBITDA exit multiple applied to the terminal metric; must be >= 0. */
  exitMultiple: number;
}

export interface WaccVsExitMultipleInput extends FixedFcffInput {
  /** EV/EBITDA exit multiples for the column axis; each must be >= 0. */
  exitMultipleValues: readonly number[];
  /** Fixed terminal-year (year N) EBITDA the exit multiple applies to; must be >= 0. */
  terminalEbitda: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

function assertAxis(values: readonly number[], label: string): void {
  if (values.length === 0) {
    throw new RangeError(`${label} must contain at least one value`);
  }
  values.forEach((value, i) => assertFinite(value, `${label}[${i}]`));
}

function assertWaccAxis(waccValues: readonly number[]): void {
  assertAxis(waccValues, "waccValues");
  waccValues.forEach((value, i) => {
    if (value <= 0) {
      throw new RangeError(`waccValues[${i}] must be > 0, got ${value}`);
    }
  });
}

function assertBridge(bridge: EquityBridgeInput): void {
  assertFinite(bridge.sharesOutstanding, "sharesOutstanding");
  if (bridge.sharesOutstanding <= 0) {
    throw new RangeError(`sharesOutstanding must be > 0, got ${bridge.sharesOutstanding}`);
  }
}

/**
 * Evenly spaced axis values centred on `center`: stepsEachSide points below,
 * the center itself, and stepsEachSide points above (2 * stepsEachSide + 1
 * values in total). Convenience for building sensitivity axes, e.g.
 * sensitivityRange(0.09, 0.005, 2) -> [0.08, 0.085, 0.09, 0.095, 0.1].
 */
export function sensitivityRange(center: number, step: number, stepsEachSide: number): number[] {
  assertFinite(center, "center");
  assertFinite(step, "step");
  if (!Number.isInteger(stepsEachSide) || stepsEachSide < 0) {
    throw new RangeError(`stepsEachSide must be a non-negative integer, got ${stepsEachSide}`);
  }
  const values: number[] = [];
  for (let i = -stepsEachSide; i <= stepsEachSide; i++) {
    values.push(center + i * step);
  }
  return values;
}

function presentValueOfForecast(freeCashFlows: readonly number[], discountRate: number): number {
  return freeCashFlows.reduce(
    (sum, fcf, i) => sum + fcf * midYearDiscountFactor(discountRate, i + 1),
    0,
  );
}

function perShareValue(
  presentValueOfForecastAtWacc: number,
  terminalValue: number,
  discountRate: number,
  terminalDiscountPeriod: number,
  bridge: EquityBridgeInput,
): number {
  const presentValueOfTerminalValue =
    terminalValue / Math.pow(1 + discountRate, terminalDiscountPeriod);
  const enterpriseValue = presentValueOfForecastAtWacc + presentValueOfTerminalValue;
  return enterpriseToEquityValue(enterpriseValue, bridge) / bridge.sharesOutstanding;
}

/**
 * Per-share value grid over WACC (rows) x terminal growth rate (columns).
 *
 * Each cell runs the Gordon Growth DCF of dcf.ts on the fixed FCFF forecast:
 * mid-year discounting at the row's WACC, terminal value at the column's
 * growth rate discounted over N - 0.5 periods, then the equity bridge.
 * Cells where the growth rate is >= the WACC are null.
 *
 * Throws RangeError if the forecast or either axis is empty, or any input
 * is out of range.
 */
export function waccVsTerminalGrowthGrid(input: WaccVsTerminalGrowthInput): SensitivityGrid {
  if (input.freeCashFlows.length === 0) {
    throw new RangeError("freeCashFlows must contain at least one forecast year");
  }
  input.freeCashFlows.forEach((fcf, i) => assertFinite(fcf, `freeCashFlows[${i}]`));
  assertWaccAxis(input.waccValues);
  assertAxis(input.terminalGrowthValues, "terminalGrowthValues");
  assertBridge(input);

  const horizon = input.freeCashFlows.length;
  // Non-empty by the guard above, so the final year always exists.
  const finalFreeCashFlow = input.freeCashFlows[horizon - 1]!;

  const values = input.waccValues.map((waccValue) => {
    // The PV of the explicit forecast varies only with WACC, so compute it
    // once per row and reuse it across the growth-rate columns.
    const pvForecast = presentValueOfForecast(input.freeCashFlows, waccValue);
    return input.terminalGrowthValues.map((growthRate) => {
      if (growthRate >= waccValue) {
        return null;
      }
      const terminalValue = gordonGrowthTerminalValue(finalFreeCashFlow, waccValue, growthRate);
      return perShareValue(pvForecast, terminalValue, waccValue, horizon - 0.5, input);
    });
  });

  return {
    rows: { label: "WACC", values: [...input.waccValues] },
    columns: { label: "Terminal growth rate", values: [...input.terminalGrowthValues] },
    values,
  };
}

function assertFixedFcff(input: FixedFcffInput): void {
  if (input.freeCashFlows.length === 0) {
    throw new RangeError("freeCashFlows must contain at least one forecast year");
  }
  input.freeCashFlows.forEach((fcf, i) => assertFinite(fcf, `freeCashFlows[${i}]`));
  assertWaccAxis(input.waccValues);
  assertBridge(input);
}

/**
 * Per-share value grid over WACC (rows) x terminal EBITDA margin (columns).
 *
 * The explicit FCFF forecast is FIXED (unlike the old percent-of-revenue
 * driver model, it is not rebuilt per column); only the terminal value
 * moves, via `terminalValue = exitMultiple * (terminalRevenue * margin)`,
 * discounted over N - 0.5 periods like the rest of the module. Cells with a
 * negative terminal EBITDA (terminalRevenue * margin < 0) are null.
 *
 * Throws RangeError if the forecast or either axis is empty, or any input
 * is out of range.
 */
export function waccVsEbitdaMarginGrid(input: WaccVsEbitdaMarginInput): SensitivityGrid {
  assertFixedFcff(input);
  assertAxis(input.ebitdaMarginValues, "ebitdaMarginValues");
  assertFinite(input.terminalRevenue, "terminalRevenue");
  if (input.terminalRevenue < 0) {
    throw new RangeError(`terminalRevenue must be >= 0, got ${input.terminalRevenue}`);
  }
  assertFinite(input.exitMultiple, "exitMultiple");
  if (input.exitMultiple < 0) {
    throw new RangeError(`exitMultiple must be >= 0, got ${input.exitMultiple}`);
  }

  const horizon = input.freeCashFlows.length;
  const terminalDiscountPeriod = horizon - 0.5;

  const values = input.waccValues.map((waccValue) => {
    const pvForecast = presentValueOfForecast(input.freeCashFlows, waccValue);
    return input.ebitdaMarginValues.map((margin) => {
      const terminalEbitda = input.terminalRevenue * margin;
      if (terminalEbitda < 0) {
        return null;
      }
      const terminalValue = exitMultipleTerminalValue(input.exitMultiple, terminalEbitda);
      return perShareValue(pvForecast, terminalValue, waccValue, terminalDiscountPeriod, input);
    });
  });

  return {
    rows: { label: "WACC", values: [...input.waccValues] },
    columns: { label: "Terminal EBITDA margin", values: [...input.ebitdaMarginValues] },
    values,
  };
}

/**
 * Per-share value grid over WACC (rows) x exit multiple (columns).
 *
 * The explicit FCFF forecast is the same FIXED stream as
 * `waccVsEbitdaMarginGrid`; only the exit multiple moves, via
 * `terminalValue = exitMultiple * terminalEbitda`, discounted over N - 0.5
 * periods.
 *
 * Throws RangeError if the forecast or either axis is empty, or any input
 * is out of range.
 */
export function waccVsExitMultipleGrid(input: WaccVsExitMultipleInput): SensitivityGrid {
  assertFixedFcff(input);
  assertAxis(input.exitMultipleValues, "exitMultipleValues");
  input.exitMultipleValues.forEach((multiple, i) => {
    if (multiple < 0) {
      throw new RangeError(`exitMultipleValues[${i}] must be >= 0, got ${multiple}`);
    }
  });
  assertFinite(input.terminalEbitda, "terminalEbitda");
  if (input.terminalEbitda < 0) {
    throw new RangeError(`terminalEbitda must be >= 0, got ${input.terminalEbitda}`);
  }

  const horizon = input.freeCashFlows.length;
  const terminalDiscountPeriod = horizon - 0.5;

  const values = input.waccValues.map((waccValue) => {
    const pvForecast = presentValueOfForecast(input.freeCashFlows, waccValue);
    return input.exitMultipleValues.map((multiple) => {
      const terminalValue = exitMultipleTerminalValue(multiple, input.terminalEbitda);
      return perShareValue(pvForecast, terminalValue, waccValue, terminalDiscountPeriod, input);
    });
  });

  return {
    rows: { label: "WACC", values: [...input.waccValues] },
    columns: { label: "Exit multiple", values: [...input.exitMultipleValues] },
    values,
  };
}

export interface DdmSensitivityInput {
  /**
   * Aggregate total dividends for years 1..N, in currency units; must be
   * non-empty. FIXED across every cell of the grid - only the discount rate
   * and terminal growth rate move.
   */
  totalDividends: readonly number[];
  /** Cost-of-equity values for the row axis, as decimals; each must be > 0. */
  costOfEquityValues: readonly number[];
  /** Terminal growth rates for the column axis, as decimals. */
  terminalGrowthValues: readonly number[];
  /** Shares outstanding (millions); must be > 0. */
  sharesOutstanding: number;
}

/**
 * Per-share value grid over cost of equity (rows) x terminal growth rate
 * (columns), reproducing the DDM sheet's sensitivity table.
 *
 * Each cell runs ddm.ts's discounting on the fixed aggregate dividend
 * stream: mid-year discounting at the row's cost of equity, Gordon Growth
 * terminal value on the final year's total dividend at the column's growth
 * rate discounted over N - 0.5 periods, then divided by shares outstanding.
 * Cells where the growth rate is >= the cost of equity are null.
 *
 * Throws RangeError if the dividend stream or either axis is empty, or any
 * input is out of range.
 */
export function ddmSensitivityGrid(input: DdmSensitivityInput): SensitivityGrid {
  if (input.totalDividends.length === 0) {
    throw new RangeError("totalDividends must contain at least one forecast year");
  }
  input.totalDividends.forEach((dividend, i) => assertFinite(dividend, `totalDividends[${i}]`));
  assertAxis(input.costOfEquityValues, "costOfEquityValues");
  input.costOfEquityValues.forEach((value, i) => {
    if (value <= 0) {
      throw new RangeError(`costOfEquityValues[${i}] must be > 0, got ${value}`);
    }
  });
  assertAxis(input.terminalGrowthValues, "terminalGrowthValues");
  assertFinite(input.sharesOutstanding, "sharesOutstanding");
  if (input.sharesOutstanding <= 0) {
    throw new RangeError(`sharesOutstanding must be > 0, got ${input.sharesOutstanding}`);
  }

  const horizon = input.totalDividends.length;
  // Non-empty by the guard above, so the final year always exists.
  const finalTotalDividend = input.totalDividends[horizon - 1]!;
  const terminalDiscountPeriod = horizon - 0.5;

  const values = input.costOfEquityValues.map((costOfEquity) => {
    const presentValueOfDividends = input.totalDividends.reduce(
      (sum, dividend, i) => sum + dividend * midYearDiscountFactor(costOfEquity, i + 1),
      0,
    );
    return input.terminalGrowthValues.map((growthRate) => {
      if (growthRate >= costOfEquity) {
        return null;
      }
      const terminalValue = gordonGrowthTerminalValue(
        finalTotalDividend,
        costOfEquity,
        growthRate,
      );
      const presentValueOfTerminalValue =
        terminalValue / Math.pow(1 + costOfEquity, terminalDiscountPeriod);
      return (presentValueOfDividends + presentValueOfTerminalValue) / input.sharesOutstanding;
    });
  });

  return {
    rows: { label: "Cost of equity", values: [...input.costOfEquityValues] },
    columns: { label: "Terminal growth rate", values: [...input.terminalGrowthValues] },
    values,
  };
}
