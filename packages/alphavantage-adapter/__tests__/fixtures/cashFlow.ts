import type { AlphaVantageStatementRow } from "../../src/statements";

/** Two annual cash-flow rows, newest-first as Alpha Vantage actually returns them. */
export const CASH_FLOW_ANNUAL: AlphaVantageStatementRow[] = [
  {
    fiscalDateEnding: "2022-09-24",
    reportedCurrency: "USD",
    operatingCashflow: "122151000000",
    depreciationDepletionAndAmortization: "11104000000",
    capitalExpenditures: "-10708000000",
    cashflowFromInvestment: "22354000000",
    cashflowFromFinancing: "-110749000000",
    dividendPayout: "-14841000000",
    paymentsForRepurchaseOfCommonStock: "-89402000000",
  },
  {
    fiscalDateEnding: "2023-09-30",
    reportedCurrency: "USD",
    operatingCashflow: "110543000000",
    depreciationDepletionAndAmortization: "11519000000",
    capitalExpenditures: "-10959000000",
    cashflowFromInvestment: "3705000000",
    cashflowFromFinancing: "-108488000000",
    dividendPayout: "-15025000000",
    paymentsForRepurchaseOfCommonStock: "-77550000000",
  },
];

export const CASH_FLOW_QUARTERLY: AlphaVantageStatementRow[] = [];
