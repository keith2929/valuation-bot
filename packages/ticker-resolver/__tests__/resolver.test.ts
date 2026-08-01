import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARKET_DESCRIPTORS,
  SGX_MARKET,
  US_MARKET,
  UnresolvedMarketError,
  resolveMarket,
  resolveTicker,
  resolveTickerSources,
  selectSourcesForMarket,
  type MarketDescriptor,
} from "../src/index";
import type { AdapterConfig, SourceAdapter } from "@valuation-bot/source-adapter";

function fakeAdapter(name: string): SourceAdapter<AdapterConfig> {
  return {
    name,
    tier: 1,
    isAvailable: () => true,
    resolveMeta: async () => {
      throw new Error("not implemented in fake");
    },
    fetchFinancials: async () => {
      throw new Error("not implemented in fake");
    },
  };
}

describe("resolveMarket", () => {
  it("resolves a bare US ticker", () => {
    expect(resolveMarket("AAPL", DEFAULT_MARKET_DESCRIPTORS)).toBe(US_MARKET);
  });

  it("resolves a US share-class ticker", () => {
    expect(resolveMarket("BRK.B", DEFAULT_MARKET_DESCRIPTORS)).toBe(US_MARKET);
  });

  it("resolves an explicit US-suffixed ticker", () => {
    expect(resolveMarket("AAPL/NASDAQ", DEFAULT_MARKET_DESCRIPTORS)).toBe(US_MARKET);
  });

  it("resolves an explicit SGX-suffixed ticker", () => {
    expect(resolveMarket("OCBC/SGX", DEFAULT_MARKET_DESCRIPTORS)).toBe(SGX_MARKET);
  });

  it("resolves a .SI vendor-convention SGX ticker", () => {
    expect(resolveMarket("O39.SI", DEFAULT_MARKET_DESCRIPTORS)).toBe(SGX_MARKET);
  });

  it("checks descriptors in list order, so SGX suffixes never fall through to US", () => {
    const market = resolveMarket("D05.SI", DEFAULT_MARKET_DESCRIPTORS);
    expect(market.id).toBe("SGX");
  });

  it("throws UnresolvedMarketError when nothing matches", () => {
    expect(() => resolveMarket("123456", DEFAULT_MARKET_DESCRIPTORS)).toThrow(UnresolvedMarketError);
  });
});

describe("resolveTicker", () => {
  it("normalizes an SGX slash-suffixed ticker to the bare symbol", () => {
    const resolution = resolveTicker("OCBC/SGX");
    expect(resolution.normalizedTicker).toBe("OCBC");
    expect(resolution.market.id).toBe("SGX");
    expect(resolution.rawTicker).toBe("OCBC/SGX");
  });

  it("normalizes a .SI ticker to the bare symbol", () => {
    const resolution = resolveTicker("o39.si");
    expect(resolution.normalizedTicker).toBe("O39");
  });

  it("normalizes a US-suffixed ticker to the bare symbol", () => {
    const resolution = resolveTicker("AAPL/NYSE");
    expect(resolution.normalizedTicker).toBe("AAPL");
    expect(resolution.market.id).toBe("US");
  });

  it("leaves a bare US ticker unchanged (aside from casing)", () => {
    expect(resolveTicker("aapl").normalizedTicker).toBe("AAPL");
  });
});

describe("selectSourcesForMarket", () => {
  it("orders adapters per the market's sourceOrder, EDGAR first for US", () => {
    const edgar = fakeAdapter("edgar");
    const vendorApi = fakeAdapter("vendor-api");
    const html = fakeAdapter("html-scraper");

    const ordered = selectSourcesForMarket(US_MARKET, [html, vendorApi, edgar]);

    expect(ordered.map((a) => a.name)).toEqual(["edgar", "vendor-api", "html-scraper"]);
  });

  it("never includes EDGAR for SGX, since it isn't in SGX's sourceOrder", () => {
    const edgar = fakeAdapter("edgar");
    const sgxFiling = fakeAdapter("sgx-filing");
    const vendorApi = fakeAdapter("vendor-api");

    const ordered = selectSourcesForMarket(SGX_MARKET, [edgar, sgxFiling, vendorApi]);

    expect(ordered.map((a) => a.name)).toEqual(["sgx-filing", "vendor-api"]);
  });

  it("skips names in sourceOrder that have no registered adapter", () => {
    const vendorApi = fakeAdapter("vendor-api");

    const ordered = selectSourcesForMarket(US_MARKET, [vendorApi]);

    expect(ordered.map((a) => a.name)).toEqual(["vendor-api"]);
  });

  it("returns an empty list when no registered adapter is eligible", () => {
    const unrelated = fakeAdapter("some-other-source");
    expect(selectSourcesForMarket(US_MARKET, [unrelated])).toEqual([]);
  });
});

describe("resolveTickerSources", () => {
  it("combines resolution and source selection for a US ticker", () => {
    const edgar = fakeAdapter("edgar");
    const vendorApi = fakeAdapter("vendor-api");

    const result = resolveTickerSources("AAPL", [vendorApi, edgar]);

    expect(result.normalizedTicker).toBe("AAPL");
    expect(result.market.id).toBe("US");
    expect(result.sources.map((a) => a.name)).toEqual(["edgar", "vendor-api"]);
  });

  it("combines resolution and source selection for an SGX ticker", () => {
    const sgxFiling = fakeAdapter("sgx-filing");
    const vendorApi = fakeAdapter("vendor-api");

    const result = resolveTickerSources("OCBC/SGX", [vendorApi, sgxFiling]);

    expect(result.normalizedTicker).toBe("OCBC");
    expect(result.market.id).toBe("SGX");
    expect(result.sources.map((a) => a.name)).toEqual(["sgx-filing", "vendor-api"]);
  });
});

describe("adding a new market", () => {
  it("requires only a new descriptor, not any change to the resolver or canonical shape", () => {
    const jpMarket: MarketDescriptor = {
      id: "TSE",
      label: "Tokyo Stock Exchange",
      exchange: "TSE",
      matches: (rawTicker) => /\/TSE$/i.test(rawTicker),
      normalize: (rawTicker) => rawTicker.replace(/\/TSE$/i, "").toUpperCase(),
      sourceOrder: ["vendor-api", "html-scraper"],
    };

    const descriptors = [...DEFAULT_MARKET_DESCRIPTORS, jpMarket];
    const resolution = resolveTicker("7203/TSE", descriptors);

    expect(resolution.market).toBe(jpMarket);
    expect(resolution.normalizedTicker).toBe("7203");
  });
});
