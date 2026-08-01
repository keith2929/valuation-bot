import { describe, expect, it } from "vitest";

import { buildMetaResult } from "../src/meta";
import type { YahooDefaultKeyStatisticsModule, YahooPriceModule } from "../src/types";

const PRICE: YahooPriceModule = {
  symbol: "TEST",
  longName: "Test Fixture Inc.",
  currency: "USD",
  exchangeName: "NasdaqGS",
  regularMarketPrice: { raw: 190.25, fmt: "190.25" },
};

const KEY_STATS: YahooDefaultKeyStatisticsModule = {
  sharesOutstanding: { raw: 15634232000, fmt: "15.63B" },
};

describe("buildMetaResult", () => {
  it("resolves identity, exchange, currency, shares and price with Tier-3 yfinance provenance", () => {
    const { meta, provenance, missingFields } = buildMetaResult("test", PRICE, KEY_STATS, "2024-01-01T00:00:00Z");
    expect(meta).toMatchObject({
      ticker: "TEST",
      companyName: "Test Fixture Inc.",
      exchange: "NasdaqGS",
      currency: "USD",
      sharesOutstanding: 15634232000,
      currentPrice: 190.25,
      fetchTimestamp: "2024-01-01T00:00:00Z",
    });
    expect(provenance.currentPrice).toMatchObject({ source: "yfinance", tier: 3 });
    expect(missingFields).toEqual([]);
  });

  it("falls back to shortName when longName is absent", () => {
    const { meta } = buildMetaResult("test", { ...PRICE, longName: undefined, shortName: "Test Co" }, null, "t");
    expect(meta.companyName).toBe("Test Co");
  });

  it("falls back to the requested ticker when price has no symbol", () => {
    const { meta } = buildMetaResult("fallback", null, null, "t");
    expect(meta.ticker).toBe("fallback");
  });

  it("reports every unresolved field via missingFields when both modules are absent", () => {
    const { meta, missingFields } = buildMetaResult("test", null, null, "2024-01-01T00:00:00Z");
    expect(missingFields).toEqual(
      expect.arrayContaining(["companyName", "exchange", "currency", "sharesOutstanding", "currentPrice"]),
    );
    expect(meta.fetchTimestamp).toBe("2024-01-01T00:00:00Z");
  });
});
