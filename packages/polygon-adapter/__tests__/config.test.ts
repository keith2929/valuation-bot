import { describe, expect, it } from "vitest";

import { hasApiKey, resolvePolygonConfig, withApiKey } from "../src/config";

describe("hasApiKey", () => {
  it("is false for missing/blank keys and true for a real one", () => {
    expect(hasApiKey(undefined)).toBe(false);
    expect(hasApiKey(null)).toBe(false);
    expect(hasApiKey({ apiKey: "" })).toBe(false);
    expect(hasApiKey({ apiKey: "   " })).toBe(false);
    expect(hasApiKey({ apiKey: "abc123" })).toBe(true);
  });
});

describe("resolvePolygonConfig", () => {
  it("applies defaults when only apiKey is supplied", () => {
    const resolved = resolvePolygonConfig({ apiKey: "k" });
    expect(resolved.baseUrl).toBe("https://api.polygon.io");
    expect(resolved.maxAnnualPeriods).toBe(10);
    expect(resolved.maxQuarterlyPeriods).toBe(8);
  });

  it("honors overrides", () => {
    const resolved = resolvePolygonConfig({ apiKey: "k", baseUrl: "https://polygon.test", maxAnnualPeriods: 3 });
    expect(resolved.baseUrl).toBe("https://polygon.test");
    expect(resolved.maxAnnualPeriods).toBe(3);
  });
});

describe("withApiKey", () => {
  it("appends '?apiKey=' when the URL has no existing query string", () => {
    expect(withApiKey("https://polygon.test/v3/reference/tickers/AAPL", "k")).toBe(
      "https://polygon.test/v3/reference/tickers/AAPL?apiKey=k",
    );
  });

  it("appends '&apiKey=' when the URL already has a query string", () => {
    expect(withApiKey("https://polygon.test/x?limit=1", "k")).toBe("https://polygon.test/x?limit=1&apiKey=k");
  });

  it("URL-encodes the key", () => {
    expect(withApiKey("https://polygon.test/x", "a b")).toBe("https://polygon.test/x?apiKey=a%20b");
  });
});
