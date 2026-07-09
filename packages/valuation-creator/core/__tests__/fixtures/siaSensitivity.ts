// Tier-1 SIA sensitivity-grid fixture: inputs and golden centre-cell values
// for the three DCF data tables on the source Excel model's "Valuation"
// sheet (rows 88-105), transcribed directly from the workbook's cell
// formulas rather than its stored data-table results.
//
// The Excel data table cells (D101:H105, L92:P96 etc.) all show the SAME
// cached value (e.g. every cell in the Gordon Growth table reads
// "9.8725378340088881") - Excel only recalculates a data table's ANCHOR
// cell and stales the rest until a full recalc, so those cached grids are
// NOT usable as goldens for anything but the centre cell. Every number
// below is read from the model's live formula cells (D13:H13, N18, D21,
// H21/H20, H22, N14, D31, D34, D35/H35), not the data-table body.
//
// Units: S$ millions except WACC/margin/growth (decimals) and per-share
// price (S$).

import type { EquityBridgeInput } from "../../src/dcf";

/**
 * Fixed explicit FCFF forecast (Valuation!D13:H13 = SUM(EBIT*(1-tax), D&A,
 * capex, changeNWC) per year) - identical to buildForecast's own FY26-30
 * FCFF for SIA (see siaForecastAssumptions.ts), reused here as a
 * standalone golden-pinned constant per this module's "fixed FCFF" grids.
 */
export const SIA_SENSITIVITY_FCFF: readonly number[] = [
  856.33937368018996, -626.7634093456918, -184.88719473764149, 581.07264332552313,
  1797.7650079705654,
];

/** Valuation!N18: WACC = (Ke*E/(D+E)) + (Kd(1-t)*D/(D+E)). */
export const SIA_SENSITIVITY_WACC_CENTER = 0.060957972127589133;

/** Valuation!D21: Gordon Growth terminal growth rate. */
export const SIA_SENSITIVITY_TGR_CENTER = 0.015;

/** Valuation!H21 ('3FS'!N26): terminal-year (FY30) EBITDA margin. */
export const SIA_SENSITIVITY_MARGIN_CENTER = 0.22382338114303521;

/** '3FS'!N9: terminal-year (FY30) revenue, the fixed base for TV = exitMultiple * (terminalRevenue * margin). */
export const SIA_SENSITIVITY_TERMINAL_REVENUE = 22017.898753163998;

/** Valuation!H22 (Comps!W13): EV/EBITDA exit multiple (peer LTM EV/EBITDA median). */
export const SIA_SENSITIVITY_EXIT_MULTIPLE_CENTER = 4.7453976643893281;

/** Valuation!H20 ('3FS'!N9 * H21): fixed terminal-year EBITDA for the exit-multiple grid. */
export const SIA_SENSITIVITY_TERMINAL_EBITDA = 4928.120544598185;

/**
 * Equity bridge: Valuation!D30/D31/D34 - net debt = total debt (9510.7,
 * '3FS'!I255) minus cash (8257.1, '3FS'!I54); shares outstanding 3151.9.
 */
export const SIA_SENSITIVITY_BRIDGE: EquityBridgeInput = {
  netDebt: 9510.7000000000007 - 8257.1,
  sharesOutstanding: 3151.9,
};

/** Golden centre-cell values (Valuation!D103/F103 and H94/K94-equivalent), see module header. */
export const SIA_SENSITIVITY_GOLDEN = {
  /** Valuation!D35 (Gordon Growth implied share price at the base WACC/TGR). */
  gordonGrowthCenter: 9.8725378340088881,
  /** Valuation!H35 (Exit Multiple implied share price at the base WACC/margin/multiple). */
  exitMultipleCenter: 5.9055129469370513,
};

/** Tolerance for the centre-cell golden checks. */
export const SENSITIVITY_TOLERANCE = 0.0001;
