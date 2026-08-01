import type { FmpProfileRow } from "../../src/meta";
import type { FmpQuoteRow } from "../../src/meta";

export const PROFILE_ROW: FmpProfileRow = {
  symbol: "TEST",
  companyName: "Test Fixture Inc.",
  currency: "USD",
  exchange: "NASDAQ Global Select",
  exchangeShortName: "NASDAQ",
  price: 189.5,
};

export const QUOTE_ROW: FmpQuoteRow = {
  symbol: "TEST",
  name: "Test Fixture Inc.",
  price: 190.25,
  sharesOutstanding: 15634232000,
};
