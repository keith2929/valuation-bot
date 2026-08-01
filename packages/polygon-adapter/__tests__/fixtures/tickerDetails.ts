import type { PolygonLastTradeResult, PolygonTickerDetailsResult } from "../../src/meta";

export const TICKER_DETAILS_RESULT: PolygonTickerDetailsResult = {
  ticker: "TEST",
  name: "Test Fixture Inc.",
  primary_exchange: "XNAS",
  currency_name: "usd",
  share_class_shares_outstanding: 15600000000,
  weighted_shares_outstanding: 15634232000,
};

export const LAST_TRADE_RESULT: PolygonLastTradeResult = {
  T: "TEST",
  p: 190.25,
};
