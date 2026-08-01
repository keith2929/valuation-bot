import type { AlphaVantageStatementRow } from "../../src/statements";

/** Two annual balance-sheet rows. `shortTermInvestments` is present but "None" on both rows, exercising both the None-sentinel and MISSING_CONCEPT. */
export const BALANCE_SHEET_ANNUAL: AlphaVantageStatementRow[] = [
  {
    fiscalDateEnding: "2022-09-24",
    reportedCurrency: "USD",
    shortTermInvestments: "None",
    totalAssets: "352755000000",
    totalCurrentAssets: "135405000000",
    cashAndCashEquivalentsAtCarryingValue: "23646000000",
    inventory: "4946000000",
    currentNetReceivables: "28184000000",
    propertyPlantEquipment: "42117000000",
    goodwill: "None",
    intangibleAssetsExcludingGoodwill: "None",
    currentAccountsPayable: "64115000000",
    currentDebt: "21110000000",
    totalCurrentLiabilities: "153982000000",
    longTermDebtNoncurrent: "98959000000",
    totalLiabilities: "302083000000",
    commonStock: "64849000000",
    retainedEarnings: "-3068000000",
    totalShareholderEquity: "50672000000",
  },
  {
    fiscalDateEnding: "2023-09-30",
    reportedCurrency: "USD",
    shortTermInvestments: "None",
    totalAssets: "352583000000",
    totalCurrentAssets: "143566000000",
    cashAndCashEquivalentsAtCarryingValue: "29965000000",
    inventory: "6331000000",
    currentNetReceivables: "29508000000",
    propertyPlantEquipment: "43715000000",
    goodwill: "None",
    intangibleAssetsExcludingGoodwill: "None",
    currentAccountsPayable: "62611000000",
    currentDebt: "15807000000",
    totalCurrentLiabilities: "145308000000",
    longTermDebtNoncurrent: "95281000000",
    totalLiabilities: "290437000000",
    commonStock: "73812000000",
    retainedEarnings: "-214000000",
    totalShareholderEquity: "62146000000",
  },
];

export const BALANCE_SHEET_QUARTERLY: AlphaVantageStatementRow[] = [];
