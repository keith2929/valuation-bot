import type { FmpStatementRow } from "../../src/statements";

export const CASH_FLOW_ANNUAL: FmpStatementRow[] = [
  {
    date: "2022-09-24",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2022-10-28",
    period: "FY",
    netCashProvidedByOperatingActivities: 122151000000,
    depreciationAndAmortization: 11104000000,
    capitalExpenditure: -10708000000,
    netCashUsedForInvestingActivites: -22354000000,
    dividendsPaid: -14841000000,
    commonStockRepurchased: -89402000000,
    netCashUsedProvidedByFinancingActivities: -110749000000,
  },
  {
    date: "2023-09-30",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2023-11-03",
    period: "FY",
    netCashProvidedByOperatingActivities: 110543000000,
    depreciationAndAmortization: 11519000000,
    capitalExpenditure: -10959000000,
    netCashUsedForInvestingActivites: 3705000000,
    dividendsPaid: -15025000000,
    commonStockRepurchased: -77550000000,
    netCashUsedProvidedByFinancingActivities: -108488000000,
  },
];

export const CASH_FLOW_QUARTERLY: FmpStatementRow[] = [
  {
    date: "2023-09-30",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2023-11-03",
    period: "Q4",
    netCashProvidedByOperatingActivities: 26400000000,
    capitalExpenditure: -2523000000,
  },
];
