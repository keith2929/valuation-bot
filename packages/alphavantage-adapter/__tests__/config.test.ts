import { describe, expect, it } from "vitest";

import { buildAlphaVantageUrl, hasApiKey, resolveAlphaVantageConfig } from "../src/config";

describe("hasApiKey", () => {
  it("is false for missing/blank keys and true for a real one", () => {
    expect(hasApiKey(undefined)).toBe(false);
    expect(hasApiKey(null)).toBe(false);
    expect(hasApiKey({ apiKey: "" })).toBe(false);
    expect(hasApiKey({ apiKey: "   " })).toBe(false);
    expect(hasApiKey({ apiKey: "abc123" })).toBe(true);
  });
});

describe("resolveAlphaVantageConfig", () => {
  it("applies defaults when only apiKey is supplied", () => {
    const resolved = resolveAlphaVantageConfig({ apiKey: "k" });
    expect(resolved.baseUrl).toBe("https://www.alphavantage.co/query");
    expect(resolved.maxAnnualPeriods).toBe(10);
    expect(resolved.maxQuarterlyPeriods).toBe(8);
  });

  it("honors overrides", () => {
    const resolved = resolveAlphaVantageConfig({ apiKey: "k", baseUrl: "https://av.test/query", maxAnnualPeriods: 3 });
    expect(resolved.baseUrl).toBe("https://av.test/query");
    expect(resolved.maxAnnualPeriods).toBe(3);
  });
});

describe("buildAlphaVantageUrl", () => {
  it("encodes function, symbol, and apikey as query parameters", () => {
    const resolved = resolveAlphaVantageConfig({ apiKey: "test-key", baseUrl: "https://av.test/query" });
    const url = buildAlphaVantageUrl(resolved, "OVERVIEW", "TEST");
    expect(url).toBe("https://av.test/query?function=OVERVIEW&symbol=TEST&apikey=test-key");
  });

  it("URL-encodes an unusual symbol/key", () => {
    const resolved = resolveAlphaVantageConfig({ apiKey: "a b", baseUrl: "https://av.test/query" });
    const url = buildAlphaVantageUrl(resolved, "GLOBAL_QUOTE", "BRK.B");
    expect(url).toContain("symbol=BRK.B");
    expect(url).toContain("apikey=a+b");
  });
});
