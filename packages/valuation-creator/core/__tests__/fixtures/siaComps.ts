// Tier-2 fixture for the trading-comps build (src/comps.ts: buildComps).
//
// Transcribed from the source Excel workbook's "Comps" sheet (rows 5-15,
// columns B-Y): a 4-peer set (Cathay Pacific, ANA, Korean Airlines, Japan
// Airlines) covering Singapore Airlines. Each peer's `currentPrice` /
// `sales` / `ebitda` / `ebit` / `earnings` / `bookValue` are the sheet's
// domestic-currency line items multiplied by that row's `D` column
// ("Conversion domestic currency --> SGD") — reproduced here as the same
// `native * fx` expression the sheet uses so the resulting IEEE-754 doubles
// match bit-for-bit. `cashAndSTInvestments` / `totalDebt` / `preferredEquity`
// / `minorityInterest` are left in domestic currency (columns K-N) since
// `buildComps`'s EV bridge applies `fxToTargetCurrency` to them itself.
//
// `ntmPE` / `ntmEvEbitda` (columns X/Y) are the sheet's own NTM multiples,
// not derived from LTM financials.
//
// `equityBeta5Y` / `marginalTaxRate` are the values `SIA_BETA_PEERS` in
// siaFixture.ts (masterprompt §6.4) records for these same companies;
// `interestExpense` has no corresponding column on the Comps sheet and is
// unused by `buildComps`, so it is held at 0.

import type { PeerData } from "@valuation-bot/contract";

export const SIA_COMPS_PEERS: PeerData[] = [
  {
    name: "Cathay Pacific",
    ticker: "SEHK:293",
    fxToTargetCurrency: 0.16,
    currentPrice: 12.62 * 0.16,
    sharesOutstanding: 6439.4,
    cashAndSTInvestments: 7990,
    totalDebt: 59101,
    preferredEquity: 0,
    minorityInterest: 7,
    sales: 116766 * 0.16,
    ebitda: 22785 * 0.16,
    ebit: 14468 * 0.16,
    earnings: 10828 * 0.16,
    bookValue: 60110 * 0.16,
    equityBeta5Y: 0.38,
    interestExpense: 0,
    marginalTaxRate: 0.165,
    ntmPE: 7.65,
    ntmEvEbitda: 4.81,
  },
  {
    name: "ANA",
    ticker: "TSE:9202",
    fxToTargetCurrency: 0.008,
    currentPrice: 2964 * 0.008,
    sharesOutstanding: 470,
    cashAndSTInvestments: 1229950,
    totalDebt: 1188294,
    preferredEquity: 0,
    minorityInterest: 10347,
    sales: 2436456 * 0.008,
    ebitda: 369977 * 0.008,
    ebit: 205794 * 0.008,
    earnings: 160195 * 0.008,
    bookValue: 1440416 * 0.008,
    equityBeta5Y: 0.49,
    interestExpense: 0,
    marginalTaxRate: 0.2974,
    ntmPE: 9.6,
    ntmEvEbitda: 3.31,
  },
  {
    name: "Korean Airlines",
    ticker: "KOSE:A003490",
    fxToTargetCurrency: 0.00086,
    currentPrice: 22400 * 0.00086,
    sharesOutstanding: 369.3,
    cashAndSTInvestments: 5420941.2,
    totalDebt: 22488055.6,
    preferredEquity: 0,
    minorityInterest: 505062.2,
    sales: 25225542.4 * 0.00086,
    ebitda: 3968453.3 * 0.00086,
    ebit: 1113289.4 * 0.00086,
    earnings: 647272.9 * 0.00086,
    bookValue: 10954036.2 * 0.00086,
    equityBeta5Y: 0.9,
    interestExpense: 0,
    marginalTaxRate: 0.264,
    ntmPE: 8.71,
    ntmEvEbitda: 6.6,
  },
  {
    name: "Japan Airlines",
    ticker: "TSE:9201",
    fxToTargetCurrency: 0.008,
    currentPrice: 2623.5 * 0.008,
    sharesOutstanding: 436.6,
    cashAndSTInvestments: 915058,
    totalDebt: 866647,
    preferredEquity: 0,
    minorityInterest: 44257,
    sales: 1998823 * 0.008,
    ebitda: 363665 * 0.008,
    ebit: 200155 * 0.008,
    earnings: 137272 * 0.008,
    bookValue: 1223263 * 0.008,
    equityBeta5Y: 0.46,
    interestExpense: 0,
    marginalTaxRate: 0.2974,
    ntmPE: 11.06,
    ntmEvEbitda: 3.04,
  },
];

// Cross-sectional statistics reproduced from the sheet's own Average /
// Minimum / 25th percentile / Median / 75th percentile / Maximum rows
// (rows 10-15, columns U/V/W for LTM P-E/P-B/EV-EBITDA, X/Y for NTM
// P-E/EV-EBITDA).
export const SIA_COMPS_EXPECTED = {
  peLtm: {
    average: 9.3314206098100616,
    minimum: 7.5051004802364245,
    p25: 7.7148663954940622,
    median: 8.5201578532733944,
    p75: 11.759237580662731,
    maximum: 12.780266252457038,
  },
  pbLtm: {
    average: 1.002657092889168,
    minimum: 0.755184650567432,
    p25: 0.80047962368297043,
    median: 0.95175090724224942,
    p75: 1.2557407477422844,
    maximum: 1.3519419065047413,
  },
  evEbitdaLtm: {
    average: 4.7853789946021363,
    minimum: 3.1382346390221771,
    p25: 3.2738487197342834,
    median: 4.7453976643893281,
    p75: 6.3368905996827971,
    maximum: 6.5124860106077112,
  },
  peNtm: {
    average: 9.2550000000000008,
    minimum: 7.65,
    p25: 7.9150000000000009,
    median: 9.1550000000000011,
    p75: 10.695,
    maximum: 11.06,
  },
  evEbitdaNtm: {
    average: 4.4399999999999995,
    minimum: 3.04,
    p25: 3.1074999999999999,
    median: 4.0599999999999996,
    p75: 6.1524999999999999,
    maximum: 6.6,
  },
};
