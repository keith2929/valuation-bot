import { describe, expect, it } from "vitest";

import { buildMetaResult } from "../src/meta";
import { LAST_TRADE_RESULT, TICKER_DETAILS_RESULT } from "./fixtures/tickerDetails";

const FETCH_TIMESTAMP = "2026-07-31T00:00:00.000Z";

describe("buildMetaResult", () => {
  it("resolves company identity, exchange, and currency (uppercased) from ticker details", () => {
    const { meta, provenance } = buildMetaResult("test", TICKER_DETAILS_RESULT, LAST_TRADE_RESULT, FETCH_TIMESTAMP);
    expect(meta.companyName).toBe("Test Fixture Inc.");
    expect(meta.exchange).toBe("XNAS");
    expect(meta.currency).toBe("USD");
    expect(provenance.companyName).toEqual({
      source: "polygon",
      tier: 2,
      asOf: FETCH_TIMESTAMP,
      periodEnd: null,
      rawUnits: null,
      confidence: 0.85,
    });
  });

  it("prefers weighted shares outstanding over share-class shares outstanding", () => {
    const { meta } = buildMetaResult("test", TICKER_DETAILS_RESULT, LAST_TRADE_RESULT, FETCH_TIMESTAMP);
    expect(meta.sharesOutstanding).toBe(15634232000);
  });

  it("falls back to share-class shares outstanding when weighted is absent", () => {
    const { meta } = buildMetaResult(
      "test",
      { ...TICKER_DETAILS_RESULT, weighted_shares_outstanding: undefined },
      LAST_TRADE_RESULT,
      FETCH_TIMESTAMP,
    );
    expect(meta.sharesOutstanding).toBe(15600000000);
  });

  it("takes currentPrice from the last-trade row", () => {
    const { meta } = buildMetaResult("test", TICKER_DETAILS_RESULT, LAST_TRADE_RESULT, FETCH_TIMESTAMP);
    expect(meta.currentPrice).toBe(190.25);
  });

  it("reports every field missing when neither details nor last-trade is available, but still fills ticker/fetchTimestamp", () => {
    const { meta, missingFields } = buildMetaResult("TEST", null, null, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
    expect(meta.fetchTimestamp).toBe(FETCH_TIMESTAMP);
    expect(missingFields).toEqual(
      expect.arrayContaining(["companyName", "exchange", "currency", "sharesOutstanding", "currentPrice"]),
    );
  });

  it("prefers the ticker-details/last-trade symbol over the raw input ticker", () => {
    const { meta } = buildMetaResult("test-lowercase", TICKER_DETAILS_RESULT, LAST_TRADE_RESULT, FETCH_TIMESTAMP);
    expect(meta.ticker).toBe("TEST");
  });

  it("still fills currentPrice when ticker details are unavailable", () => {
    const { meta, missingFields } = buildMetaResult("TEST", null, LAST_TRADE_RESULT, FETCH_TIMESTAMP);
    expect(meta.currentPrice).toBe(190.25);
    expect(missingFields).not.toContain("currentPrice");
    expect(missingFields).toContain("companyName");
  });
});
