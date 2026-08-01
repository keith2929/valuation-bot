import type { AlphaVantageGlobalQuote, AlphaVantageOverview } from "../../src/meta";

export const OVERVIEW_ROW: AlphaVantageOverview = {
  Symbol: "TEST",
  Name: "Test Fixture Inc.",
  Exchange: "NASDAQ",
  Currency: "USD",
  FiscalYearEnd: "September",
  SharesOutstanding: "15634232000",
};

export const QUOTE_ROW: AlphaVantageGlobalQuote = {
  "01. symbol": "TEST",
  "05. price": "190.2500",
};
