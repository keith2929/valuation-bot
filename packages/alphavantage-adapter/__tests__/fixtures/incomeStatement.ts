import type { AlphaVantageStatementRow } from "../../src/statements";

/** Three annual income-statement rows for a fictional ticker, newest-first as Alpha Vantage actually returns them. Every numeric field is a string, per Alpha Vantage's convention. */
export const INCOME_STATEMENT_ANNUAL: AlphaVantageStatementRow[] = [
  {
    fiscalDateEnding: "2023-09-30",
    reportedCurrency: "USD",
    grossProfit: "169148000000",
    totalRevenue: "383285000000",
    costOfRevenue: "214137000000",
    costofGoodsAndServicesSold: "None",
    operatingIncome: "114301000000",
    sellingGeneralAndAdministrative: "24932000000",
    researchAndDevelopment: "29915000000",
    operatingExpenses: "54847000000",
    interestExpense: "3933000000",
    incomeBeforeTax: "113736000000",
    incomeTaxExpense: "16741000000",
    netIncome: "96995000000",
  },
  {
    fiscalDateEnding: "2022-09-24",
    reportedCurrency: "USD",
    grossProfit: "170782000000",
    totalRevenue: "394328000000",
    costOfRevenue: "223546000000",
    operatingIncome: "119437000000",
    netIncome: "99803000000",
  },
  {
    fiscalDateEnding: "2021-09-25",
    reportedCurrency: "USD",
    totalRevenue: "365817000000",
    netIncome: "94680000000",
  },
];

/** One quarterly row (several fields intentionally omitted/"None" to exercise MISSING_CONCEPT and the None-sentinel). */
export const INCOME_STATEMENT_QUARTERLY: AlphaVantageStatementRow[] = [
  {
    fiscalDateEnding: "2023-09-30",
    reportedCurrency: "USD",
    totalRevenue: "89498000000",
    netIncome: "22956000000",
    researchAndDevelopment: "None",
  },
];
