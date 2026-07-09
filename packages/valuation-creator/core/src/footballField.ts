// Football field: per-share valuation ranges across methods.
//
// A football field chart summarises a valuation by drawing one horizontal bar
// per method, spanning the low and high per-share values that method
// produces, with the overall target price and current market price plotted
// alongside. This module computes the bars as plain data (no rendering),
// reproducing the source Excel model's "Valuation" sheet football-field
// chart: seven bars, in a fixed order:
//
// 1. DCF (Gordon Growth)  - min/max across the WACC x terminal growth rate
//                            sensitivity grid (waccVsTerminalGrowthGrid).
// 2. DCF (Exit Multiple)  - min/max across the WACC x exit multiple
//                            sensitivity grid (waccVsExitMultipleGrid).
// 3. LTM EV/EBITDA        - min/max implied price from comps
//                            (applyCompsToTarget's evEbitdaLtm statistics).
// 4. LTM P/B               - min/max implied price from comps (pbLtm).
// 5. NTM EV/EBITDA         - min/max implied price from comps (evEbitdaNtm).
// 6. DDM                   - min/max across the cost of equity x terminal
//                            growth rate sensitivity grid (ddmSensitivityGrid).
// 7. 52-week range          - the target's 52-week trading low/high.
//
// This module does not run any valuation itself - every bar is assembled
// from grids and statistics already built by sensitivity.ts and comps.ts,
// plus the target's market data. Each bar reports {min, mean, max} with
// mean = AVERAGE(min, max) (NOT the average of every underlying scenario
// value), so a method whose grid happens to have more cells does not shift
// its own centre point.
//
// The result also carries the headline target price (the DCF Exit
// Multiple base-case implied price, i.e. that grid's centre cell) and the
// current market price, both plotted as reference lines across all bars.

import type { CompsImpliedValuation } from "./comps";
import type { SensitivityGrid } from "./sensitivity";
import type { MarketData } from "@valuation-bot/contract";

export type FootballFieldMethod =
  | "dcfGordonGrowth"
  | "dcfExitMultiple"
  | "evEbitdaLtm"
  | "pbLtm"
  | "evEbitdaNtm"
  | "ddm"
  | "week52Range";

export interface FootballFieldRange {
  /** Lowest per-share value in the range. */
  min: number;
  /** AVERAGE(min, max). */
  mean: number;
  /** Highest per-share value in the range. */
  max: number;
}

export interface FootballFieldBar extends FootballFieldRange {
  /** Stable identifier for the valuation method behind the bar. */
  method: FootballFieldMethod;
  /** Human-readable label, e.g. for the chart's category axis. */
  label: string;
}

export interface FootballFieldInput {
  /** DCF Gordon Growth grid (WACC x terminal growth rate), from waccVsTerminalGrowthGrid. */
  dcfGordonGrowthGrid: SensitivityGrid;
  /** DCF Exit Multiple grid (WACC x exit multiple), from waccVsExitMultipleGrid. */
  dcfExitMultipleGrid: SensitivityGrid;
  /** DDM grid (cost of equity x terminal growth rate), from ddmSensitivityGrid. */
  ddmGrid: SensitivityGrid;
  /** Comps-implied valuation of the target, from applyCompsToTarget. */
  comps: CompsImpliedValuation;
  /**
   * Headline target price: the base-case DCF Exit Multiple implied price
   * per share (i.e. dcfExitMultipleGrid's centre cell).
   */
  targetPrice: number;
  /** Target's market data; supplies currentPrice and the 52-week bar. */
  marketData: MarketData;
}

export interface FootballFieldResult {
  /** One bar per method, in the fixed order documented above. */
  bars: FootballFieldBar[];
  /** Headline target price (DCF Exit Multiple base case). */
  targetPrice: number;
  /** Current market price per share. */
  currentPrice: number;
}

function range(min: number, max: number): FootballFieldRange {
  return { min, mean: (min + max) / 2, max };
}

function gridRange(grid: SensitivityGrid, label: string): FootballFieldRange {
  const values = grid.values.flat().filter((value): value is number => value !== null);
  if (values.length === 0) {
    throw new RangeError(`${label} grid has no valid (non-null) cells`);
  }
  return range(Math.min(...values), Math.max(...values));
}

function bar(
  method: FootballFieldMethod,
  label: string,
  valueRange: FootballFieldRange,
): FootballFieldBar {
  return { method, label, ...valueRange };
}

/**
 * Assemble the seven-bar football field from already-built sensitivity
 * grids and comps-implied statistics (see the module header for the
 * per-bar sources).
 *
 * Throws RangeError if any grid has no valid (non-null) cells.
 */
export function footballField(input: FootballFieldInput): FootballFieldResult {
  const bars: FootballFieldBar[] = [
    bar(
      "dcfGordonGrowth",
      "DCF (Gordon Growth)",
      gridRange(input.dcfGordonGrowthGrid, "DCF (Gordon Growth)"),
    ),
    bar(
      "dcfExitMultiple",
      "DCF (Exit Multiple)",
      gridRange(input.dcfExitMultipleGrid, "DCF (Exit Multiple)"),
    ),
    bar(
      "evEbitdaLtm",
      "LTM EV/EBITDA",
      range(
        input.comps.evEbitdaLtm.minimum.impliedPrice,
        input.comps.evEbitdaLtm.maximum.impliedPrice,
      ),
    ),
    bar(
      "pbLtm",
      "LTM P/B",
      range(input.comps.pbLtm.minimum.impliedPrice, input.comps.pbLtm.maximum.impliedPrice),
    ),
    bar(
      "evEbitdaNtm",
      "NTM EV/EBITDA",
      range(
        input.comps.evEbitdaNtm.minimum.impliedPrice,
        input.comps.evEbitdaNtm.maximum.impliedPrice,
      ),
    ),
    bar("ddm", "Dividend Discount Model", gridRange(input.ddmGrid, "DDM")),
    bar(
      "week52Range",
      "52-Week Range",
      range(input.marketData.week52Low, input.marketData.week52High),
    ),
  ];

  return {
    bars,
    targetPrice: input.targetPrice,
    currentPrice: input.marketData.currentPrice,
  };
}
