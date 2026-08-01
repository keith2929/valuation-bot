import type { YahooQuoteSummaryResponse, YahooStatementRow } from "../../src/types";

function incomeRow(endDate: string, totalRevenue: number, netIncome: number): YahooStatementRow {
  return {
    endDate: { raw: Math.floor(new Date(endDate).getTime() / 1000), fmt: endDate },
    totalRevenue: { raw: totalRevenue, fmt: String(totalRevenue) },
    costOfRevenue: { raw: totalRevenue * 0.6, fmt: "" },
    grossProfit: { raw: totalRevenue * 0.4, fmt: "" },
    operatingIncome: { raw: totalRevenue * 0.25, fmt: "" },
    incomeBeforeTax: { raw: totalRevenue * 0.22, fmt: "" },
    incomeTaxExpense: { raw: totalRevenue * 0.05, fmt: "" },
    netIncome: { raw: netIncome, fmt: String(netIncome) },
  };
}

function balanceSheetRow(endDate: string, totalAssets: number): YahooStatementRow {
  return {
    endDate: { raw: Math.floor(new Date(endDate).getTime() / 1000), fmt: endDate },
    cash: { raw: totalAssets * 0.1, fmt: "" },
    totalCurrentAssets: { raw: totalAssets * 0.4, fmt: "" },
    totalAssets: { raw: totalAssets, fmt: String(totalAssets) },
    totalCurrentLiabilities: { raw: totalAssets * 0.2, fmt: "" },
    totalLiab: { raw: totalAssets * 0.5, fmt: "" },
    totalStockholderEquity: { raw: totalAssets * 0.5, fmt: "" },
  };
}

function cashFlowRow(endDate: string, netCashFromOperating: number): YahooStatementRow {
  return {
    endDate: { raw: Math.floor(new Date(endDate).getTime() / 1000), fmt: endDate },
    totalCashFromOperatingActivities: { raw: netCashFromOperating, fmt: String(netCashFromOperating) },
    depreciation: { raw: netCashFromOperating * 0.1, fmt: "" },
    capitalExpenditures: { raw: -netCashFromOperating * 0.15, fmt: "" },
  };
}

export const QUOTE_SUMMARY_OK_BODY: YahooQuoteSummaryResponse = {
  quoteSummary: {
    result: [
      {
        price: {
          symbol: "TEST",
          longName: "Test Fixture Inc.",
          shortName: "Test Fixture",
          currency: "USD",
          exchangeName: "NasdaqGS",
          regularMarketPrice: { raw: 190.25, fmt: "190.25" },
        },
        defaultKeyStatistics: {
          sharesOutstanding: { raw: 15634232000, fmt: "15.63B" },
        },
        incomeStatementHistory: {
          incomeStatementHistory: [incomeRow("2022-09-30", 350000000000, 77000000000), incomeRow("2023-09-30", 383285000000, 96995000000)],
        },
        incomeStatementHistoryQuarterly: {
          incomeStatementHistory: [incomeRow("2023-06-30", 90000000000, 20000000000)],
        },
        balanceSheetHistory: {
          balanceSheetStatements: [balanceSheetRow("2022-09-30", 350000000000), balanceSheetRow("2023-09-30", 352755000000)],
        },
        balanceSheetHistoryQuarterly: {
          balanceSheetStatements: [balanceSheetRow("2023-06-30", 340000000000)],
        },
        cashflowStatementHistory: {
          cashflowStatements: [cashFlowRow("2022-09-30", 122000000000), cashFlowRow("2023-09-30", 110543000000)],
        },
        cashflowStatementHistoryQuarterly: {
          cashflowStatements: [cashFlowRow("2023-06-30", 28000000000)],
        },
      },
    ],
    error: null,
  },
};

export const QUOTE_SUMMARY_NOT_FOUND_BODY: YahooQuoteSummaryResponse = {
  quoteSummary: {
    result: null,
    error: { code: "Not Found", description: "No fundamentals data found for any of the summaryTypes=... entries" },
  },
};
