// Tier-1 fixture for the assumption-derivation helpers (src/forecast.ts:
// daysOutstanding / percentOf / trailingAverage and the composed
// deriveOperatingAssumptions / grossPpeToSalesRatio).
//
// `SIA_FINANCIALS` below is transcribed VERBATIM from masterprompt2.md §6.1,
// the same reproduction target as
// `packages/adapter/__tests__/fixtures/siaRoundTrip.ts`. It is re-transcribed
// here (rather than imported) so this package has no cross-package relative
// import into `adapter`'s test-only fixtures, mirroring the isolation
// rationale documented in that file.
//
// `SIA_GROSS_PPE` is additional historical data the shared `FinancialStatements`
// contract does not carry (only net PPE): gross, pre-depreciation PP&E,
// transcribed from the source model's "Gross Property, Plant & Equipment"
// row, for the one driver (`grossPpeToSalesRatio`) that needs it.
//
// Units: all monetary figures are in SGD millions, fiscal years FY2021-FY2025.

import type { FinancialStatements } from "@valuation-bot/contract";

export const SIA_FINANCIALS: FinancialStatements = {
  fiscalYears: ["2021", "2022", "2023", "2024", "2025"],
  currency: "SGD",
  incomeStatement: {
    revenue:          [3815.9, 7614.8, 17774.8, 19012.7, 19539.8],
    cogs:             [3551.8, 5391.3, 11143.0, 12366.3, 13292.1],
    sga:              [-1.0,   238.7,  814.4,   809.0,   830.5],
    dandA:            [2075.9, 1927.6, 2004.9,  2109.6,  2308.2],
    otherOpEx:        [631.9,  595.9,  1018.4,  895.0,   1292.7],
    ebit:             [-2508.5, -610.7, 2718.5, 2756.6,  1743.5],
    interestExpense:  [-264.7, -386.8, -416.2,  -418.1,  -389.9],
    interestIncome:   [43.8,   49.9,   416.6,   631.7,   494.1],
    incomeTaxExpense: [-673.8, -141.9, 473.5,   342.0,   152.6],
    netIncome:        [-4270.7, -962.0, 2156.8, 2674.8,  2778.0],
    minorityInterest: [12.7,  -13.9,  -6.5,    -20.3,   -34.2],
  },
  balanceSheet: {
    cash:                     [7783.0, 13762.7, 16327.6, 11256.0, 8257.1],
    shortTermInvestments:     [292.7,  424.5,   426.4,   1315.4,  965.1],
    receivables:              [1035.9, 1750.8,  1524.7,  1865.9,  1593.6],
    inventory:                [194.9,  187.4,   227.0,   268.0,   344.9],
    prepaid:                  [80.7,   93.2,    105.0,   153.9,   109.9],
    otherCurrentAssets:       [284.8,  1464.0,  607.4,   706.5,   91.9],
    netPPE:                   [19811.5, 19637.4, 19258.7, 20390.2, 21207.5],
    longTermInvestments:      [1189.3, 1241.6,  1250.6,  1285.7,  4666.1],
    goodwill:                 [14.0,   14.0,    1.6,     6.3,     6.3],
    intangibles:              [230.9,  219.3,   212.8,   214.4,   230.8],
    otherLTAssets:            [6663.6, 9870.6,  9078.2,  6726.4,  5580.1],
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
    commonEquity:             [10676.3, 16871.4, 13375.3, 8727.9,  7180.9],
    retainedEarnings:         [5634.3, 4673.6,  6174.0,  7305.7,  8473.1],
    minorityInterest:         [372.2,  388.5,   391.5,   406.7,   413.8],
    totalEquity:              [16278.1, 22800.4, 20249.8, 16744.6, 16070.0],
    bookValueOfEquity:        [15905.9, 22411.9, 19858.3, 16337.9, 15656.2],
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

/**
 * Gross (pre-depreciation) property, plant & equipment, FY2021-FY2025, SGD
 * millions. Not part of the `FinancialStatements` contract (which carries
 * only net PPE); sourced from the underlying model for `grossPpeToSalesRatio`.
 */
export const SIA_GROSS_PPE: readonly number[] = [
  28349.8, 28775.8, 29249.200000000001, 31553, 33701.599999999999,
];
