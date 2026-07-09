// Tier-1 SIA valuation fixture: documented inputs needed to run the FULL
// engine (forecast -> Hamada peer beta -> CAPM -> WACC -> DCF, and forecast
// net income -> payout -> DDM), plus the golden per-share outputs the engine
// must reproduce.
//
// Every figure below is transcribed from the source Excel workbook
// ("Singapore Airlines Limited Model _Final_.xlsx"), "Valuation" sheet
// (cell references noted inline) — none are invented or reverse-calibrated.
// Units: monetary capital-structure figures are in S$ millions, shares
// outstanding in millions, per-share figures in S$.

import { hamadaBetaFromPeers } from "../../src/hamada";
import type { PeerValueBetaInput } from "../../src/hamada";
import type { HistoricalPayoutYear } from "../../src/ddm";
import { costOfEquityCapm } from "../../src/wacc";

/** Decimal places at which the golden per-share values are stated. */
export const PER_SHARE_DECIMALS = 4;

/** Relative tolerance for non-per-share golden figures (±0.5%). */
export const RELATIVE_TOLERANCE = 0.005;

/**
 * SIA beta peers (Valuation!B75:K81), full-service-carrier comparables used
 * to derive SIA's asset beta via the Hamada equation. Qantas (row 76) is
 * flagged as an outlier and excluded from the average per the sheet's own
 * B82 "Average" formula (`AVERAGE(K75,K77:K81)`, which skips K76).
 */
export const SIA_BETA_PEERS: PeerValueBetaInput[] = [
  { name: "Cathay Pacific", equityBeta5Y: 0.38, equityValue: 13002.44, totalDebt: 9456.16, marginalTaxRate: 0.165 },
  { name: "Qantas", equityBeta5Y: 0.6, equityValue: 11544.19, totalDebt: 8241.0, marginalTaxRate: 0.3, excluded: true },
  { name: "Air France", equityBeta5Y: 1.29, equityValue: 22823.22, totalDebt: 2655.1, marginalTaxRate: 0.2583 },
  { name: "Lufthansa", equityBeta5Y: 1.23, equityValue: 11544.19, totalDebt: 20921.04, marginalTaxRate: 0.2993 },
  { name: "ANA", equityBeta5Y: 0.49, equityValue: 11144.64, totalDebt: 9506.35, marginalTaxRate: 0.2974 },
  { name: "Korean Air", equityBeta5Y: 0.9, equityValue: 7114.2, totalDebt: 18369.4, marginalTaxRate: 0.264 },
  { name: "Japan Airlines", equityBeta5Y: 0.46, equityValue: 9165.46, totalDebt: 6933.18, marginalTaxRate: 0.2974 },
];

/**
 * SIA's own capital structure for the Hamada relevering (Valuation!F84:J84):
 * D/E = 10874.8 / 21016.503, tax = 0.17. Distinct from the market-value D
 * and E used for the WACC weights below (`siaWaccMarketValues`) — the
 * Comps-sheet capitalization differs from the current market cap used to
 * weight WACC.
 */
export const siaHamadaTarget = {
  debtToEquity: 10874.8 / 21016.503,
  taxRate: 0.17,
};

/** CAPM market parameters (Valuation!N5, N7). */
export const siaCapmInputs = {
  riskFreeRate: 0.0197,
  equityRiskPremium: 0.0783,
};

/**
 * Derive SIA's CAPM cost of equity from the documented peer beta build
 * (`SIA_BETA_PEERS` relevered to `siaHamadaTarget`) and CAPM inputs
 * (`siaCapmInputs`). Exposed so sibling fixtures/tests that need the same
 * real cost of equity (e.g. the DDM sensitivity grid and football field
 * layer tests) don't have to re-derive or re-invent it.
 */
export function deriveSiaCostOfEquity(): number {
  const hamada = hamadaBetaFromPeers(SIA_BETA_PEERS, siaHamadaTarget);
  return costOfEquityCapm({
    riskFreeRate: siaCapmInputs.riskFreeRate,
    equityBeta: hamada.releveredEquityBeta,
    equityRiskPremium: siaCapmInputs.equityRiskPremium,
  });
}

/** Cost-of-debt and tax inputs (Valuation!N10:N11): 389.9 / 9510.7, 17%. */
export const siaCostOfDebtInputs = {
  interestExpense: 389.9,
  marketValueOfDebt: 9510.7,
  taxRate: 0.17,
};

/**
 * Market values weighting the WACC (Valuation!N14:N15): current share price
 * (6.49) times shares outstanding (3151.9) for equity, total debt (9510.7).
 */
export const siaWaccMarketValues = {
  marketValueOfEquity: 6.49 * 3151.9,
  marketValueOfDebt: 9510.7,
};

/** Current market price per share (Valuation!D37), feeding DCF upside. */
export const siaCurrentPrice = 6.49;

/** Diluted shares outstanding (Valuation!D34/D65), used by both DCF and DDM. */
export const siaSharesOutstanding = 3151.9;

/**
 * Enterprise-to-equity bridge (Valuation!D30:D31): net debt = total debt
 * (9510.7) less cash ('3FS'!I54, 8257.1).
 */
export const siaEquityBridge = {
  netDebt: 9510.7 - 8257.1,
  sharesOutstanding: siaSharesOutstanding,
};

/** Long-run perpetuity growth (Valuation!D21/D57), shared by DCF and DDM. */
export const siaTerminalGrowthRate = 0.015;

/** EV/EBITDA exit multiple applied to terminal-year EBITDA (Valuation!H22, Comps!W13). */
export const siaExitMultiple = 4.7453976643893281;

/**
 * Last two historical years' aggregate common dividends paid / net income
 * (S$m), feeding the DDM payout-ratio average (Valuation!G44:H47).
 */
export const siaHistoricalPayout: HistoricalPayoutYear[] = [
  { name: "FY2024", totalDividendsPaid: 1130.2, netIncome: 2674.8 },
  { name: "FY2025", totalDividendsPaid: 1428.8, netIncome: 2778.0 },
];

/**
 * Special dividends per share declared for forecast years 1..3 (Valuation!
 * I49:M49): S$0.10 each, none thereafter.
 */
export const siaSpecialDividendsPerShare = [0.1, 0.1, 0.1, 0, 0];

/**
 * Golden intermediate and per-share outputs, transcribed from the Valuation
 * sheet's live formula cells (full precision, not rounded display values).
 */
export const SIA_VALUATION_GOLDEN = {
  /** Valuation!K82. */
  avgAssetBeta: 0.48048211615214104,
  /** Valuation!C84 / N6. */
  releveredBeta: 0.68683766164355697,
  /** Valuation!N8. */
  costOfEquity: 0.073479388906690507,
  /** Valuation!N12. */
  afterTaxCostOfDebt: 0.034026622646072313,
  /** Valuation!N18. */
  wacc: 0.060957972127589133,
  /** Valuation!D27 / H27. */
  presentValueOfForecastFcff: 1948.2542151457694,
  gordonGrowth: {
    /** Valuation!D22. */
    terminalValue: 39704.351576355017,
    /** Valuation!D23. */
    presentValueOfTerminalValue: 30422.597783866848,
    /** Valuation!D29. */
    enterpriseValue: 32370.851999012619,
    /** Valuation!D33. */
    equityValue: 31117.251999012617,
    /** Valuation!D35. */
    equityValuePerShare: "9.8725",
  },
  exitMultiple: {
    /** Valuation!H23. */
    terminalValue: 23385.891722165292,
    /** Valuation!H24. */
    presentValueOfTerminalValue: 17918.932042305125,
    /** Valuation!H29. */
    enterpriseValue: 19867.186257450896,
    /** Valuation!H33. */
    equityValue: 18613.586257450894,
    /** Valuation!H35. */
    equityValuePerShare: "5.9055",
    /** Valuation!H37. */
    upside: -0.090059638376417395,
  },
  ddm: {
    /** Valuation!D64. */
    equityValue: 12189.770953856667,
    /** Valuation!D66. */
    impliedPrice: "3.8674",
  },
} as const;
