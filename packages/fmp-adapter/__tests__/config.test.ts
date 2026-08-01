import { describe, expect, it } from "vitest";

import { hasApiKey, resolveFmpConfig, withApiKey } from "../src/config";

describe("hasApiKey", () => {
  it("is false for missing/blank keys and true for a real one", () => {
    expect(hasApiKey(undefined)).toBe(false);
    expect(hasApiKey(null)).toBe(false);
    expect(hasApiKey({ apiKey: "" })).toBe(false);
    expect(hasApiKey({ apiKey: "   " })).toBe(false);
    expect(hasApiKey({ apiKey: "abc123" })).toBe(true);
  });
});

describe("resolveFmpConfig", () => {
  it("applies defaults when only apiKey is supplied", () => {
    const resolved = resolveFmpConfig({ apiKey: "k" });
    expect(resolved.baseUrl).toBe("https://financialmodelingprep.com/api/v3");
    expect(resolved.maxAnnualPeriods).toBe(10);
    expect(resolved.maxQuarterlyPeriods).toBe(8);
  });

  it("honors overrides", () => {
    const resolved = resolveFmpConfig({ apiKey: "k", baseUrl: "https://fmp.test/v3", maxAnnualPeriods: 3 });
    expect(resolved.baseUrl).toBe("https://fmp.test/v3");
    expect(resolved.maxAnnualPeriods).toBe(3);
  });
});

describe("withApiKey", () => {
  it("appends '?apikey=' when the URL has no existing query string", () => {
    expect(withApiKey("https://fmp.test/profile/AAPL", "k")).toBe("https://fmp.test/profile/AAPL?apikey=k");
  });

  it("appends '&apikey=' when the URL already has a query string", () => {
    expect(withApiKey("https://fmp.test/x?period=annual", "k")).toBe("https://fmp.test/x?period=annual&apikey=k");
  });

  it("URL-encodes the key", () => {
    expect(withApiKey("https://fmp.test/x", "a b")).toBe("https://fmp.test/x?apikey=a%20b");
  });
});
