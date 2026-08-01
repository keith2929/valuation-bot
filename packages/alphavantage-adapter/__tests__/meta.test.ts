import { describe, expect, it } from "vitest";

import { buildMetaResult } from "../src/meta";
import { OVERVIEW_ROW, QUOTE_ROW } from "./fixtures/overviewQuote";

const FETCH_TIMESTAMP = "2026-07-31T00:00:00.000Z";

describe("buildMetaResult", () => {
  it("resolves company identity, exchange, and currency from overview", () => {
    const { meta, provenance } = buildMetaResult("test", OVERVIEW_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.companyName).toBe("Test Fixture Inc.");
    expect(meta.exchange).toBe("NASDAQ");
    expect(meta.currency).toBe("USD");
    expect(provenance.companyName).toEqual({
      source: "alphavantage",
      tier: 2,
      asOf: FETCH_TIMESTAMP,
      periodEnd: null,
      rawUnits: null,
      confidence: 0.8,
    });
  });

  it("parses string-encoded shares outstanding and price", () => {
    const { meta } = buildMetaResult("test", OVERVIEW_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.sharesOutstanding).toBe(15634232000);
    expect(meta.currentPrice).toBe(190.25);
  });

  it("reports currentPrice missing when the quote is unavailable (overview carries no price field)", () => {
    const { meta, missingFields } = buildMetaResult("test", OVERVIEW_ROW, null, FETCH_TIMESTAMP);
    expect(meta.currentPrice).toBeUndefined();
    expect(missingFields).toContain("currentPrice");
  });

  it("reports every field missing when neither overview nor quote is available, but still fills ticker/fetchTimestamp", () => {
    const { meta, missingFields } = buildMetaResult("TEST", null, null, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
    expect(meta.fetchTimestamp).toBe(FETCH_TIMESTAMP);
    expect(missingFields).toEqual(
      expect.arrayContaining(["companyName", "exchange", "currency", "sharesOutstanding", "currentPrice"]),
    );
  });

  it("prefers the overview/quote symbol over the raw input ticker", () => {
    const { meta } = buildMetaResult("test-lowercase", OVERVIEW_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
  });

  it("treats a \"None\"-valued shares outstanding as absent", () => {
    const { meta, missingFields } = buildMetaResult(
      "TEST",
      { ...OVERVIEW_ROW, SharesOutstanding: "None" },
      QUOTE_ROW,
      FETCH_TIMESTAMP,
    );
    expect(meta.sharesOutstanding).toBeUndefined();
    expect(missingFields).toContain("sharesOutstanding");
  });
});
