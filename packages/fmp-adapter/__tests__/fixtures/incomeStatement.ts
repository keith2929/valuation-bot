import type { FmpStatementRow } from "../../src/statements";

/** Three annual income-statement rows for a fictional ticker, newest-first as FMP actually returns them. */
export const INCOME_STATEMENT_ANNUAL: FmpStatementRow[] = [
  {
    date: "2023-09-30",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2023-11-03",
    acceptedDate: "2023-11-02 18:08:27",
    period: "FY",
    revenue: 383285000000,
    costOfRevenue: 214137000000,
    grossProfit: 169148000000,
    researchAndDevelopmentExpenses: 29915000000,
    sellingGeneralAndAdministrativeExpenses: 24932000000,
    operatingExpenses: 54847000000,
    operatingIncome: 114301000000,
    interestExpense: 3933000000,
    incomeBeforeTax: 113736000000,
    incomeTaxExpense: 16741000000,
    netIncome: 96995000000,
    eps: 6.16,
    epsdiluted: 6.13,
    weightedAverageShsOut: 15744231000,
    weightedAverageShsOutDil: 15812547000,
  },
  {
    date: "2022-09-24",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2022-10-28",
    acceptedDate: "2022-10-27 18:01:14",
    period: "FY",
    revenue: 394328000000,
    costOfRevenue: 223546000000,
    grossProfit: 170782000000,
    operatingIncome: 119437000000,
    netIncome: 99803000000,
    eps: 6.15,
    epsdiluted: 6.11,
  },
  {
    date: "2021-09-25",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2021-10-29",
    acceptedDate: "2021-10-28 18:04:28",
    period: "FY",
    revenue: 365817000000,
    netIncome: 94680000000,
  },
];

/** One quarterly row (goodwill-style optional fields intentionally omitted to exercise MISSING_CONCEPT). */
export const INCOME_STATEMENT_QUARTERLY: FmpStatementRow[] = [
  {
    date: "2023-09-30",
    symbol: "TEST",
    reportedCurrency: "USD",
    fillingDate: "2023-11-03",
    acceptedDate: "2023-11-02 18:08:27",
    period: "Q4",
    revenue: 89498000000,
    netIncome: 22956000000,
  },
];
