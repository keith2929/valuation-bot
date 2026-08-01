import { describe, expect, it } from "vitest";

import { isRateLimited } from "@valuation-bot/source-adapter";

import { createPolygonAdapter, type PolygonConfig } from "../src/polygonAdapter";
import { FINANCIALS_ANNUAL, FINANCIALS_QUARTERLY } from "./fixtures/financials";
import { LAST_TRADE_RESULT, TICKER_DETAILS_RESULT } from "./fixtures/tickerDetails";

const BASE_URL = "https://polygon.test";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads. */
function response(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

const RATE_LIMIT_BODY = JSON.stringify({
  status: "ERROR",
  request_id: "abc123",
  message: "You've exceeded the maximum requests per minute, please wait or upgrade your subscription to continue.",
});

const NOT_FOUND_BODY = JSON.stringify({ status: "NOT_FOUND", request_id: "abc123", error: "Ticker not found." });

interface StubOptions {
  /** Force a specific HTTP status for requests whose URL contains this substring (e.g. "/v3/reference/tickers" or "/v2/last/trade"). */
  statusFor?: { match: string; status: number }[];
  /** Serve the Polygon rate-limit 200-body for requests whose URL contains this substring. */
  rateLimitBodyFor?: string[];
  /** Serve the Polygon "not found" 200-status-error body for requests whose URL contains this substring. */
  notFoundFor?: string[];
  /** Throw a network error for requests whose URL contains this substring. */
  networkErrorFor?: string[];
  seenUrls?: string[];
}

function stubFetch(opts: StubOptions = {}) {
  return (async (url: string) => {
    opts.seenUrls?.push(url);

    if (opts.networkErrorFor?.some((match) => url.includes(match))) {
      throw new Error("boom: connection reset");
    }

    const forcedStatus = opts.statusFor?.find((entry) => url.includes(entry.match))?.status;
    if (forcedStatus !== undefined && forcedStatus !== 200) {
      return response(forcedStatus, "", { "retry-after": "0" });
    }

    if (opts.rateLimitBodyFor?.some((match) => url.includes(match))) {
      return response(200, RATE_LIMIT_BODY);
    }
    if (opts.notFoundFor?.some((match) => url.includes(match))) {
      return response(200, NOT_FOUND_BODY);
    }

    if (url.includes("/v3/reference/tickers/")) {
      return response(200, JSON.stringify({ status: "OK", results: TICKER_DETAILS_RESULT }));
    }
    if (url.includes("/v2/last/trade/")) {
      return response(200, JSON.stringify({ status: "OK", results: LAST_TRADE_RESULT }));
    }
    if (url.includes("/vX/reference/financials")) {
      const results = url.includes("timeframe=annual") ? FINANCIALS_ANNUAL : FINANCIALS_QUARTERLY;
      return response(200, JSON.stringify({ status: "OK", results }));
    }
    return response(404, "");
  }) as unknown as typeof fetch;
}

function makeConfig(opts: StubOptions = {}): PolygonConfig {
  return {
    apiKey: "test-key",
    baseUrl: BASE_URL,
    http: { fetchImpl: stubFetch(opts), sleep: async () => {}, maxRetries: 1, baseDelayMs: 0 },
  };
}

describe("createPolygonAdapter - identity", () => {
  it("is named 'polygon' at Tier 2", () => {
    const adapter = createPolygonAdapter(makeConfig());
    expect(adapter.name).toBe("polygon");
    expect(adapter.tier).toBe(2);
  });

  it("isAvailable requires a non-blank API key", () => {
    const adapter = createPolygonAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "   " })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "abc123" })).toBe(true);
  });
});

describe("createPolygonAdapter - resolveMeta", () => {
  it("sends the API key as a query parameter on every request", async () => {
    const seenUrls: string[] = [];
    const adapter = createPolygonAdapter(makeConfig({ seenUrls }));
    await adapter.resolveMeta("TEST");
    expect(seenUrls.length).toBe(2);
    expect(seenUrls.every((url) => url.includes("apiKey=test-key"))).toBe(true);
  });

  it("resolves identity, exchange, currency, shares and price with Tier-2 Polygon provenance", async () => {
    const adapter = createPolygonAdapter(makeConfig());
    const result = await adapter.resolveMeta("test");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");

    expect(result.meta.ticker).toBe("TEST");
    expect(result.meta.companyName).toBe("Test Fixture Inc.");
    expect(result.meta.exchange).toBe("XNAS");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.sharesOutstanding).toBe(15634232000);
    expect(result.meta.currentPrice).toBe(190.25);
    expect(result.meta.fetchTimestamp).not.toBeNull();

    expect(result.provenance.meta.currentPrice).toMatchObject({ source: "polygon", tier: 2 });
  });

  it("always notes that fiscalYearEnd cannot come from Polygon's reference/market-data endpoints", async () => {
    const adapter = createPolygonAdapter(makeConfig());
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "fiscalYearEnd");
    expect(note?.code).toBe("MISSING_FISCAL_YEAR_END");
  });

  it("surfaces a ticker-details failure as TICKER_DETAILS_UNAVAILABLE while still resolving last-trade-derived fields", async () => {
    const adapter = createPolygonAdapter(makeConfig({ statusFor: [{ match: "/v3/reference/tickers/", status: 404 }] }));
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "TICKER_DETAILS_UNAVAILABLE")).toBe(true);
    expect(result.meta.currentPrice).toBe(190.25);
  });

  it("surfaces an unknown-ticker 200-status-error body as a non-fatal error, not a rate limit", async () => {
    const adapter = createPolygonAdapter(makeConfig({ notFoundFor: ["/v3/reference/tickers/"] }));
    const result = await adapter.resolveMeta("NOPE");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "TICKER_DETAILS_UNAVAILABLE")).toBe(true);
  });

  it("folds a network error into a LAST_TRADE_UNAVAILABLE note, never throwing", async () => {
    const adapter = createPolygonAdapter(makeConfig({ networkErrorFor: ["/v2/last/trade/"] }));
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "LAST_TRADE_UNAVAILABLE")).toBe(true);
  });

  it("returns the RateLimited sentinel when Polygon responds 429", async () => {
    const adapter = createPolygonAdapter(makeConfig({ statusFor: [{ match: "/v2/last/trade/", status: 429 }] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("polygon");
  });

  it("returns the RateLimited sentinel when Polygon responds 200 with a rate-limit error body", async () => {
    const adapter = createPolygonAdapter(makeConfig({ rateLimitBodyFor: ["/v3/reference/tickers/"] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("polygon");
  });
});

describe("createPolygonAdapter - fetchFinancials", () => {
  it("sends the API key as a query parameter on both the annual and quarterly request", async () => {
    const seenUrls: string[] = [];
    const adapter = createPolygonAdapter(makeConfig({ seenUrls }));
    await adapter.fetchFinancials("TEST");
    expect(seenUrls.length).toBe(2);
    expect(seenUrls.every((url) => url.includes("apiKey=test-key"))).toBe(true);
    expect(seenUrls.some((url) => url.includes("timeframe=annual"))).toBe(true);
    expect(seenUrls.some((url) => url.includes("timeframe=quarterly"))).toBe(true);
  });

  it("normalizes all three statements with per-field Tier-2 Polygon provenance", async () => {
    const adapter = createPolygonAdapter(makeConfig());
    const result = await adapter.fetchFinancials("test");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;

    expect(result.financials.incomeStatement?.annual).toHaveLength(2);
    expect(result.financials.balanceSheet?.annual).toHaveLength(2);
    expect(result.financials.cashFlow?.annual).toHaveLength(2);
    expect(result.financials.incomeStatement?.quarterly).toHaveLength(1);

    const revenue = result.financials.incomeStatement?.annual[1]?.find((item) => item.tag === "revenue");
    expect(revenue?.value.raw).toBe(383285000000);

    const provValues = Object.values(result.provenance.financials);
    expect(provValues.length).toBeGreaterThan(0);
    expect(provValues.every((record) => record.source === "polygon" && record.tier === 2)).toBe(true);
  });

  it("surfaces a concept absent from every row as a non-fatal MISSING_CONCEPT note", async () => {
    const adapter = createPolygonAdapter(makeConfig());
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "balanceSheet.inventory");
    expect(note?.code).toBe("MISSING_CONCEPT");
  });

  it("folds a failing timeframe request into a FINANCIALS_UNAVAILABLE note without failing the whole fetch", async () => {
    const adapter = createPolygonAdapter(makeConfig({ statusFor: [{ match: "timeframe=quarterly", status: 404 }] }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.financials.incomeStatement?.annual.length).toBeGreaterThan(0);
    expect(result.financials.incomeStatement?.quarterly ?? []).toEqual([]);
    const note = result.errors.find((e) => e.code === "FINANCIALS_UNAVAILABLE");
    expect(note?.field).toBe("quarterly");
  });

  it("folds a network error into a FINANCIALS_UNAVAILABLE note, never throwing", async () => {
    const adapter = createPolygonAdapter(makeConfig({ networkErrorFor: ["timeframe=annual"] }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "FINANCIALS_UNAVAILABLE" && e.field === "annual")).toBe(true);
  });

  it("returns the RateLimited sentinel when Polygon responds 429 to a financials request", async () => {
    const adapter = createPolygonAdapter(makeConfig({ statusFor: [{ match: "timeframe=annual", status: 429 }] }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("polygon");
  });

  it("returns the RateLimited sentinel when Polygon responds 200 with a rate-limit error body for financials", async () => {
    const adapter = createPolygonAdapter(makeConfig({ rateLimitBodyFor: ["vX/reference/financials"] }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("polygon");
  });
});

describe("createPolygonAdapter - skip cleanly with no API key", () => {
  it("isAvailable is false with an empty apiKey, signaling the orchestrator to skip this source", () => {
    const adapter = createPolygonAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
  });
});
