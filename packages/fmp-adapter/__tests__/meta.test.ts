import { describe, expect, it } from "vitest";

import { buildMetaResult } from "../src/meta";
import { PROFILE_ROW, QUOTE_ROW } from "./fixtures/profileQuote";

const FETCH_TIMESTAMP = "2026-07-31T00:00:00.000Z";

describe("buildMetaResult", () => {
  it("resolves company identity, exchange, and currency from profile", () => {
    const { meta, provenance } = buildMetaResult("test", PROFILE_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.companyName).toBe("Test Fixture Inc.");
    expect(meta.exchange).toBe("NASDAQ");
    expect(meta.currency).toBe("USD");
    expect(provenance.companyName).toEqual({
      source: "fmp",
      tier: 2,
      asOf: FETCH_TIMESTAMP,
      periodEnd: null,
      rawUnits: null,
      confidence: 0.85,
    });
  });

  it("prefers the quote's live price and shares outstanding over profile", () => {
    const { meta } = buildMetaResult("test", PROFILE_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.currentPrice).toBe(190.25);
    expect(meta.sharesOutstanding).toBe(15634232000);
  });

  it("falls back to profile.price when the quote is unavailable", () => {
    const { meta, missingFields } = buildMetaResult("test", PROFILE_ROW, null, FETCH_TIMESTAMP);
    expect(meta.currentPrice).toBe(189.5);
    expect(missingFields).toContain("sharesOutstanding");
  });

  it("reports every field missing when neither profile nor quote is available, but still fills ticker/fetchTimestamp", () => {
    const { meta, missingFields } = buildMetaResult("TEST", null, null, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
    expect(meta.fetchTimestamp).toBe(FETCH_TIMESTAMP);
    expect(missingFields).toEqual(
      expect.arrayContaining(["companyName", "exchange", "currency", "sharesOutstanding", "currentPrice"]),
    );
  });

  it("prefers the profile/quote symbol over the raw input ticker", () => {
    const { meta } = buildMetaResult("test-lowercase", PROFILE_ROW, QUOTE_ROW, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
  });
});
