// Embedded Singapore Airlines (SIA) fixture data, transcribed VERBATIM from
// masterprompt2.md Part 6 (sections 6.1-6.6). This is the reference model:
// all figures are in SGD millions unless noted; fiscal year ends 31 March;
// historicals FY2021-FY2025, forecast FY2026-FY2030.
//
// Do not re-derive, estimate, or round any figure here — every number below
// must match the spec exactly.

import type { Exchange, FinancialStatements, MarketData } from "@valuation-bot/contract";

// ---------------------------------------------------------------------------
// 6.1 Historical statements (FY2021 -> FY2025)
// ---------------------------------------------------------------------------
export const SIA_FINANCIALS: FinancialStatements = {
  fiscalYears: ["2021", "2022", "2023", "2024", "2025"],
  currency: "SGD",
  incomeStatement: {
    revenue:          [3815.9, 7614.8, 17774.8, 19012.7, 19539.8],
    cogs:             [3551.8, 5391.3, 11143.0, 12366.3, 13292.1],
    sga:              [-1.0,   238.7,  814.4,   809.0,   830.5],
    dandA:            [2075.9, 1927.6, 2004.9,  2109.6,  2308.2],
    otherOpEx:        [631.9,  595.9,  1018.4,  895.0,   1292.7],
    ebit:             [-2508.5, -610.7, 2718.5, 2756.6,  1743.5],   // operating income
    interestExpense:  [-264.7, -386.8, -416.2,  -418.1,  -389.9],
    interestIncome:   [43.8,   49.9,   416.6,   631.7,   494.1],
    incomeTaxExpense: [-673.8, -141.9, 473.5,   342.0,   152.6],
    netIncome:        [-4270.7, -962.0, 2156.8, 2674.8,  2778.0],
    minorityInterest: [12.7,  -13.9,  -6.5,    -20.3,   -34.2],
  },
  balanceSheet: {
    cash:                     [7783.0, 13762.7, 16327.6, 11256.0, 8257.1],
    shortTermInvestments:     [292.7,  424.5,   426.4,   1315.4,  965.1],
    receivables:              [1035.9, 1750.8,  1524.7,  1865.9,  1593.6],  // total receivables
    inventory:                [194.9,  187.4,   227.0,   268.0,   344.9],
    prepaid:                  [80.7,   93.2,    105.0,   153.9,   109.9],
    otherCurrentAssets:       [284.8,  1464.0,  607.4,   706.5,   91.9],
    netPPE:                   [19811.5, 19637.4, 19258.7, 20390.2, 21207.5],
    longTermInvestments:      [1189.3, 1241.6,  1250.6,  1285.7,  4666.1],
    goodwill:                 [14.0,   14.0,    1.6,     6.3,     6.3],
    intangibles:              [230.9,  219.3,   212.8,   214.4,   230.8],
    otherLTAssets:            [6663.6, 9870.6,  9078.2,  6726.4,  5580.1],  // incl deferred charges
    totalAssets:              [37581.3, 48671.0, 49101.2, 44264.7, 43086.8],
    accountsPayable:          [1676.4, 2408.8,  3932.3,  4259.3,  4509.2],
    accrued:                  [71.7,   72.5,    66.2,    57.6,    50.1],
    currentPortionLTDebt:     [1310.8, 844.2,   2547.9,  915.5,   2213.4],
    currentLeases:            [491.4,  567.7,   617.3,   613.0,   536.9],
    taxesPayable:             [95.4,   153.3,   128.1,   68.2,    72.5],
    unearnedRevCurrent:       [1537.2, 3046.2,  5519.2,  5787.4,  5839.8],
    otherCurrentLiabilities:  [530.3,  775.9,   859.9,   970.7,   733.2],
    longTermDebt:             [10827.3, 11405.7, 8613.7, 8737.4,  7297.3],
    longTermLeases:           [2373.6, 3114.8,  3560.6,  3182.2,  2866.7],
    pensionOPEB:              [106.6,  99.9,    91.2,    84.7,    58.1],
    deferredTaxLiability:     [1032.5, 1064.3,  1430.2,  1802.9,  1884.5],
    otherNonCurrentLiabilities: [1250.0, 2317.3, 1484.8, 1041.2,  955.1],
    totalLiabilities:         [21303.2, 25870.6, 28851.4, 27520.1, 27016.8],
    commonEquity:             [10676.3, 16871.4, 13375.3, 8727.9,  7180.9], // share capital
    retainedEarnings:         [5634.3, 4673.6,  6174.0,  7305.7,  8473.1],
    minorityInterest:         [372.2,  388.5,   391.5,   406.7,   413.8],
    totalEquity:              [16278.1, 22800.4, 20249.8, 16744.6, 16070.0],
    bookValueOfEquity:        [15905.9, 22411.9, 19858.3, 16337.9, 15656.2], // total common equity
  },
  cashFlow: {
    dandA:               [2075.9, 1927.6, 2004.9, 2109.6, 2308.2],
    capex:               [-2695.5, -3048.7, -1605.6, -1231.3, -1768.0],
    commonDividendsPaid: [0.0,    0.0,    -297.1, -1130.2, -1428.8],
    changeReceivables:   [225.8, -385.3,  422.1,  -177.7, 168.8],
    changeInventory:     [-13.1,  0.5,    -46.1,  -47.8,  -88.1],
    changePayables:      [-2621.5, 485.3, 1191.4, 117.8,  70.2],
    changeUnearnedRev:   [-1271.3, 1507.6, 2464.2, 243.5, 52.6],
    changeOtherNWC:      [256.0, -89.4,   5.0,    -98.7,  144.6],
  },
};

// ---------------------------------------------------------------------------
// 6.2 Market data (as of ~9 Mar 2026)
// ---------------------------------------------------------------------------
// Note: E = 6.49 * 3151.9 = 20455.831 used for WACC weights; MV of debt
// 9510.7; total capital 29966.531.
export const SIA_MARKET: MarketData = {
  currentPrice: 6.49, sharesOutstanding: 3151.9,
  week52High: 7.63, week52Low: 6.21,
  marketValueOfDebt: 9510.7, cash: 8257.1, currency: "SGD",
};

// ---------------------------------------------------------------------------
// 6.3 Forecast assumptions (editable inputs; Base drives the reference outputs)
// ---------------------------------------------------------------------------
export interface ScenarioTriple {
  bear: number[];
  base: number[];
  bull: number[];
}

export interface ScenarioLevel {
  bear: number;
  base: number;
  bull: number;
}

export interface ForecastAssumptions {
  scenario: "Bear" | "Base" | "Bull";
  revenueGrowth: ScenarioTriple;
  cogsPctRev: ScenarioTriple;
  sgaPctRev: ScenarioLevel;
  otherOpExPctRev: ScenarioLevel;
  capex: number[];
  taxRate: number;
  // WACC inputs
  riskFreeRate: number;
  marketRiskPremium: number;
  preTaxCostOfDebt: number;
  // terminal values
  dcfTerminalGrowth: number;
  ddmTerminalGrowth: number;
  // DDM
  ddmPayoutRatio: number;
  specialDPS: number[];
  // Excel-precision overrides (additive; the rounded ScenarioTriple/ScenarioLevel
  // fields above remain the verbatim spec figures)
  baseRevenueGrowth: number[];               // FY26..FY30, full precision base-case revenue growth
  cogsPctRevBaseOverrides: (number | null)[]; // FY26..FY30; null = use base cogsPctRev.base as-is
  scenarioOffsets: {
    revenueGrowth: number;               // +/- applied to baseRevenueGrowth for bear/bull
    cogs: { bear: number; bull: number };
    sga: number;                          // +/- applied to sgaPctRev.base
    otherOpEx: number;                    // +/- applied to otherOpExPctRev.base
  };
  // DCF exit multiple (defaults to the comps EV/EBITDA LTM median; user-editable override)
  exitMultiple: number;
  // Sensitivity-grid step sizes (distance between adjacent axis points)
  sensitivityStepSizes: {
    wacc: number;
    dcfTerminalGrowth: number;
    exitMultiple: number;
    terminalEbitdaMargin: number;
    ddmCostOfEquity: number;
    ddmTerminalGrowth: number;
  };
}

export const SIA_ASSUMPTIONS: ForecastAssumptions = {
  scenario: "Base",
  revenueGrowth: { bear: [0.01, 0.02, 0.02, 0.01, 0.01], base: [0.02, 0.03, 0.03, 0.02, 0.02], bull: [0.03, 0.04, 0.04, 0.03, 0.03] },
  cogsPctRev:    { bear: [0.65, 0.69, 0.69, 0.65, 0.65], base: [0.67, 0.71, 0.71, 0.67, 0.67], bull: [0.68, 0.72, 0.72, 0.68, 0.68] },
  sgaPctRev:     { bear: 0.03, base: 0.04, bull: 0.05 },
  otherOpExPctRev: { bear: 0.06, base: 0.07, bull: 0.08 },
  capex:         [-3500, -4700, -4100, -3800, -3000],   // direct inputs, FY26..FY30
  taxRate: 0.17,
  // WACC inputs
  riskFreeRate: 0.0197,   // 10Y SG Gov Bond
  marketRiskPremium: 0.0783, // BBG SG ERP
  preTaxCostOfDebt: 0.041,
  // terminal values
  dcfTerminalGrowth: 0.015,
  ddmTerminalGrowth: 0.015,
  // DDM
  ddmPayoutRatio: 0.4684,           // = average of FY24 (0.4225) and FY25 (0.5143)
  specialDPS: [0.10, 0.10, 0.10, 0.0, 0.0], // FY26..FY30, x sharesOutstanding
  baseRevenueGrowth: [0.022931184556648665, 0.028951006185113037, 0.028997448663183434, 0.02, 0.02],
  // FY26/29/30 previously fell through to the rounded `cogsPctRev.base`
  // (0.67) here, diverging from the Excel-precision COGS% (0.66639561517925916)
  // pinned by core's verified `siaForecastAssumptions` fixture -- close enough
  // to pass a loose check, but not tight enough to reproduce the Tier-1 DCF/DDM
  // per-share goldens (9.8725/5.9055/3.8674), which are asserted to 4dp.
  cogsPctRevBaseOverrides: [0.66639561517925916, 0.71, 0.71, 0.66639561517925916, 0.66639561517925916],
  scenarioOffsets: {
    revenueGrowth: 0.01,
    cogs: { bear: -0.02, bull: 0.01 },
    sga: 0.01,
    otherOpEx: 0.01,
  },
  // Comps EV/EBITDA LTM median for the SIA peer set (Comps!W13) — the DCF
  // exit-multiple default; user can override in the Assumptions panel.
  exitMultiple: 4.7453976643893281,
  // Matches the spacing of SIA_SENSITIVITY_GRID_AXES below.
  sensitivityStepSizes: {
    wacc: 0.01,
    dcfTerminalGrowth: 0.005,
    exitMultiple: 1.0,
    terminalEbitdaMargin: 0.01,
    ddmCostOfEquity: 0.01,
    ddmTerminalGrowth: 0.005,
  },
};

// Forecast drivers these assumptions must reproduce (FY2026->FY2030), used as
// the DCF FCFF inputs.
export interface ForecastDrivers {
  ebit: number[];
  dandA: number[];
  capex: number[];
  changeNWC: number[];
  fcff: number[];
  ebitda: number[];
  terminalEBITDA: number;
  terminalEBITDAMargin: number;
  // Excel-precision forecast outputs (additive)
  netIncome: number[];
  revenue: number[];
  forecastCash: number[];
  forecastDebt: number;
  totalDividends: number[];
}

export const SIA_FORECAST_DRIVERS: ForecastDrivers = {          // SGD m, FY2026..FY2030
  ebit:      [2120.20, 1225.70, 1086.90, 1952.06, 1946.53],
  dandA:     [2353.55, 2480.78, 2727.06, 2879.43, 2981.59],
  capex:     [-3500,   -4700,   -4100,   -3800,   -3000],
  changeNWC: [243.02,  575.12,  285.93,  -118.57, 200.55],
  fcff:      [856.34,  -626.76, -184.89, 581.07,  1797.77],  // = ebit*(1-0.17)+dandA+capex+changeNWC
  ebitda:    [4473.75, 3706.48, 3813.96, 4831.49, 4928.12],
  terminalEBITDA: 4928.12, terminalEBITDAMargin: 0.2238,
  netIncome:     [1785.4062296108814, 1001.7425741775993, 864.18805837231787, 1575.0885145359157, 1607.4039152026849],
  revenue:       [19987.87076, 20566.53973, 21162.91691, 21586.1752482, 22017.8987532],
  forecastCash:  [8405.1389537723535, 7293.5388998017988, 6665.9031124806615, 6464.0313579251051, 7500.6219792234315],
  forecastDebt:  9613.1015894271604,
  totalDividends: [836.34062380390947, 469.24783586154535, 404.81295955851681, 737.82116862023088, 752.95872213823861],
};

// ---------------------------------------------------------------------------
// 6.4 Beta peers (Hamada) — PeerData subset used for beta
// ---------------------------------------------------------------------------
// Peer equity values/debt already converted to SGD m. Average asset beta and
// relevered SIA beta are the anchors. Note: masterprompt2.md §6.4 tabulates
// Air France's equityValue/totalDebt swapped relative to its own documented
// assetBeta of 1.1875 (that figure only comes out of the low-leverage
// reading, i.e. equityValue 22823.22 / totalDebt 2655.10) — this fixture
// uses the corrected (swapped) values, matching the verified core fixture
// (core/__tests__/fixtures/siaValuation.ts) and its exact-math golden test.
// `excluded: true` on Qantas is the default outlier exclusion that
// reproduces the sheet's average asset beta of 0.4805 (see §6.7); it is a
// default, not a hardcoded rule — the UI lets it be toggled back in.
export interface BetaPeer {
  name: string;
  equityBeta5Y: number;
  equityValue: number;
  totalDebt: number;
  marginalTaxRate: number;
  assetBeta: number;
  /** Default outlier-exclusion flag; toggleable in the Beta/WACC view. */
  excluded?: boolean;
}

export const SIA_BETA_PEERS: BetaPeer[] = [
  { name: "Cathay Pacific", equityBeta5Y: 0.38, equityValue: 13002.44, totalDebt: 9456.16,  marginalTaxRate: 0.165, assetBeta: 0.2364 },
  { name: "Qantas",         equityBeta5Y: 0.60, equityValue: 11544.19, totalDebt: 8241.0,   marginalTaxRate: 0.300, assetBeta: 0.4001, excluded: true },
  { name: "Air France",     equityBeta5Y: 1.29, equityValue: 22823.22, totalDebt: 2655.10,  marginalTaxRate: 0.2583, assetBeta: 1.1875 },
  { name: "Lufthansa",      equityBeta5Y: 1.23, equityValue: 11544.19, totalDebt: 20921.04, marginalTaxRate: 0.2993, assetBeta: 0.5419 },
  { name: "ANA",            equityBeta5Y: 0.49, equityValue: 11144.64, totalDebt: 9506.35,  marginalTaxRate: 0.2974, assetBeta: 0.3064 },
  { name: "Korean Air",     equityBeta5Y: 0.90, equityValue: 7114.20,  totalDebt: 18369.40, marginalTaxRate: 0.264,  assetBeta: 0.3103 },
  { name: "Japan Airlines", equityBeta5Y: 0.46, equityValue: 9165.46,  totalDebt: 6933.18,  marginalTaxRate: 0.2974, assetBeta: 0.3004 },
];

/**
 * SIA's own capital structure for the Hamada relevering (Valuation!F84:J84):
 * D/E = 10874.8 / 21016.503, tax = 0.17 -> targetEquityBeta = 0.6868 (given
 * avgAssetBeta 0.4805). Distinct from the market-value D/E used for the WACC
 * weights (SIA_MARKET.marketValueOfDebt vs currentPrice*sharesOutstanding)
 * -- the Comps-sheet capitalization differs from current market cap.
 */
export const SIA_HAMADA_TARGET = {
  debtToEquity: 10874.8 / 21016.503,
  taxRate: 0.17,
};

// ---------------------------------------------------------------------------
// 6.5 Comps peers (multiples) — 4-peer set
// ---------------------------------------------------------------------------
// `price`/`sales`/`ebitda`/`ebit`/`earnings`/`bookValue` are the domestic
// figures times `fx` (kept as the multiplication expression, not a rounded
// literal, so this reproduces the verified core fixture's IEEE-754 doubles
// bit-for-bit — see core/__tests__/fixtures/siaComps.ts, the source of
// `minorityInterest`/`ntmPE`/`ntmEvEbitda`/the Korean Air fx correction
// (0.00086, not 0.0009) below). `cashSTI`/`totalDebt`/`minorityInterest` stay
// in domestic currency; `FixtureProvider.getPeer` applies `fx` to them only
// when bridging market cap to enterprise value.
export interface CompsPeer {
  name: string;
  ticker: string;
  price: number;
  shares: number;
  cashSTI: number;
  totalDebt: number;
  minorityInterest: number;
  sales: number;
  ebitda: number;
  ebit: number;
  earnings: number;
  bookValue: number;
  fx: number;
  ntmPE: number;
  ntmEvEbitda: number;
}

export const SIA_COMPS_PEERS: CompsPeer[] = [ // SGD m unless noted
  { name: "Cathay Pacific", ticker: "SEHK:293",     price: 12.62 * 0.16,    shares: 6439.4, cashSTI: 7990,      totalDebt: 59101,      minorityInterest: 7,        sales: 116766 * 0.16,     ebitda: 22785 * 0.16,   ebit: 14468 * 0.16,   earnings: 10828 * 0.16,  bookValue: 60110 * 0.16,    fx: 0.16,    ntmPE: 7.65,  ntmEvEbitda: 4.81 },
  { name: "ANA",            ticker: "TSE:9202",     price: 2964 * 0.008,    shares: 470.0,  cashSTI: 1229950,   totalDebt: 1188294,    minorityInterest: 10347,    sales: 2436456 * 0.008,   ebitda: 369977 * 0.008, ebit: 205794 * 0.008, earnings: 160195 * 0.008, bookValue: 1440416 * 0.008, fx: 0.008,   ntmPE: 9.6,   ntmEvEbitda: 3.31 },
  { name: "Korean Air",     ticker: "KOSE:A003490", price: 22400 * 0.00086, shares: 369.3,  cashSTI: 5420941.2, totalDebt: 22488055.6, minorityInterest: 505062.2, sales: 25225542.4 * 0.00086, ebitda: 3968453.3 * 0.00086, ebit: 1113289.4 * 0.00086, earnings: 647272.9 * 0.00086, bookValue: 10954036.2 * 0.00086, fx: 0.00086, ntmPE: 8.71,  ntmEvEbitda: 6.6 },
  { name: "Japan Airlines", ticker: "TSE:9201",     price: 2623.5 * 0.008,  shares: 436.6,  cashSTI: 915058,    totalDebt: 866647,     minorityInterest: 44257,    sales: 1998823 * 0.008,   ebitda: 363665 * 0.008, ebit: 200155 * 0.008, earnings: 137272 * 0.008, bookValue: 1223263 * 0.008, fx: 0.008,   ntmPE: 11.06, ntmEvEbitda: 3.04 },
];

/** `{ticker, exchange}` refs for `MarketDataProvider.getPeer`, one per `SIA_COMPS_PEERS` entry. */
export interface CompsPeerRef {
  ticker: string;
  exchange: Exchange;
}

export const SIA_COMPS_PEER_REFS: CompsPeerRef[] = [
  { ticker: "293", exchange: "SEHK" },
  { ticker: "9202", exchange: "TSE" },
  { ticker: "A003490", exchange: "KOSE" },
  { ticker: "9201", exchange: "TSE" },
];

// SIA target metrics for comps:
// LTM: EBITDA 4124.5, earnings 2778.0, BV of equity 15656.2, total debt 9510.7, cash 8257.1
// NTM: EBITDA 4473.75, earnings 1785.41, total debt 9613.10, cash 8405.14

// ---------------------------------------------------------------------------
// 6.6 Sensitivity grid axes
// ---------------------------------------------------------------------------
export interface SensitivityGridAxes {
  dcfGordon: {
    waccRows: number[];   // center 0.061
    tgrCols: number[];    // center 0.015
  };
  dcfExitMultiple: {
    waccRows: number[];                  // center 0.061
    terminalEbitdaMarginCols: number[];  // center 0.2238
    exitMultipleCols: number[];          // Excel alt axis; center 4.7454
  };
  ddm: {
    coeRows: number[];  // center 0.0735
    tgrCols: number[];  // center 0.015
  };
}

export const SIA_SENSITIVITY_GRID_AXES: SensitivityGridAxes = {
  // DCF Gordon: WACC rows [0.041, 0.051, 0.061, 0.071, 0.081] (center 0.061) x
  // TGR cols [0.005, 0.010, 0.015, 0.020, 0.025] (center 0.015).
  dcfGordon: {
    waccRows: [0.041, 0.051, 0.061, 0.071, 0.081],
    tgrCols: [0.005, 0.010, 0.015, 0.020, 0.025],
  },
  // DCF exit multiple: WACC x terminal EBITDA margin [0.2038, 0.2138, 0.2238,
  // 0.2338, 0.2438] (center 0.2238). (Excel also runs WACC x exit multiple
  // [2.7454..6.7454 step 1.0], center 4.7454.)
  dcfExitMultiple: {
    waccRows: [0.041, 0.051, 0.061, 0.071, 0.081],
    terminalEbitdaMarginCols: [0.2038, 0.2138, 0.2238, 0.2338, 0.2438],
    exitMultipleCols: [2.7454, 3.7454, 4.7454, 5.7454, 6.7454],
  },
  // DDM: COE rows [0.0535, 0.0635, 0.0735, 0.0835, 0.0935] (center 0.0735) x
  // TGR cols [0.005..0.025 step 0.005] (center 0.015).
  ddm: {
    coeRows: [0.0535, 0.0635, 0.0735, 0.0835, 0.0935],
    tgrCols: [0.005, 0.010, 0.015, 0.020, 0.025],
  },
};
