import { describe, expect, it } from "vitest";

import { isRateLimited } from "@valuation-bot/source-adapter";

import { createYfinanceAdapter, type YfinanceConfig } from "../src/yfinanceAdapter";
import { QUOTE_SUMMARY_NOT_FOUND_BODY, QUOTE_SUMMARY_OK_BODY } from "./fixtures/quoteSummary";

const COOKIE_URL = "https://fc.yf.test";
const CRUMB_URL = "https://yf.test/getcrumb";
const QUOTE_SUMMARY_URL = "https://yf.test/quoteSummary";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads. */
function response(status: number, body: string, headers: Record<string, string> = {}, setCookieValues: string[] = []) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      getSetCookie: () => setCookieValues,
    },
    text: async () => body,
  } as unknown as Response;
}

interface StubOptions {
  cookieStatus?: number;
  crumbStatus?: number;
  crumbBody?: string;
  quoteSummaryStatus?: number;
  quoteSummaryBody?: unknown;
  networkErrorForQuoteSummary?: boolean;
  seenUrls?: string[];
}

function stubFetch(opts: StubOptions = {}) {
  return (async (url: string) => {
    opts.seenUrls?.push(url);
    if (url.includes("fc.yf.test")) {
      return response(opts.cookieStatus ?? 200, "", {}, opts.cookieStatus && opts.cookieStatus !== 200 ? [] : ["A3=abc123; Path=/"]);
    }
    if (url.includes("getcrumb")) {
      return response(opts.crumbStatus ?? 200, opts.crumbBody ?? "the-crumb");
    }
    if (url.includes("quoteSummary")) {
      if (opts.networkErrorForQuoteSummary) throw new Error("boom: connection reset");
      return response(opts.quoteSummaryStatus ?? 200, JSON.stringify(opts.quoteSummaryBody ?? QUOTE_SUMMARY_OK_BODY));
    }
    return response(404, "");
  }) as unknown as typeof fetch;
}

function makeConfig(opts: StubOptions = {}): YfinanceConfig {
  return {
    consentCookieUrl: COOKIE_URL,
    crumbUrl: CRUMB_URL,
    quoteSummaryBaseUrl: QUOTE_SUMMARY_URL,
    http: { fetchImpl: stubFetch(opts), sleep: async () => {}, maxRetries: 1, baseDelayMs: 0 },
  };
}

describe("createYfinanceAdapter - identity", () => {
  it("is named 'yfinance' at Tier 3", () => {
    const adapter = createYfinanceAdapter(makeConfig());
    expect(adapter.name).toBe("yfinance");
    expect(adapter.tier).toBe(3);
  });

  it("isAvailable is true by default and false only when explicitly disabled", () => {
    const adapter = createYfinanceAdapter(makeConfig());
    expect(adapter.isAvailable({})).toBe(true);
    expect(adapter.isAvailable({ enabled: false })).toBe(false);
  });
});

describe("createYfinanceAdapter - fetchFinancials", () => {
  it("normalizes all three statements with per-field Tier-3 yfinance provenance", async () => {
    const adapter = createYfinanceAdapter(makeConfig());
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;

    expect(result.financials.incomeStatement?.annual).toHaveLength(2);
    expect(result.financials.balanceSheet?.annual).toHaveLength(2);
    expect(result.financials.cashFlow?.annual).toHaveLength(2);

    const revenue = result.financials.incomeStatement?.annual[1]?.find((item) => item.tag === "revenue");
    expect(revenue?.value.raw).toBe(383285000000);

    const provValues = Object.values(result.provenance.financials);
    expect(provValues.length).toBeGreaterThan(0);
    expect(provValues.every((record) => record.source === "yfinance" && record.tier === 3)).toBe(true);
  });

  it("obtains the crumb via cookie before requesting quoteSummary, and sends both on the request", async () => {
    const seenUrls: string[] = [];
    const adapter = createYfinanceAdapter(makeConfig({ seenUrls }));
    await adapter.fetchFinancials("TEST");
    expect(seenUrls[0]).toContain("fc.yf.test");
    expect(seenUrls[1]).toContain("getcrumb");
    expect(seenUrls[2]).toContain("crumb=the-crumb");
  });

  it("surfaces a concept absent from every row as a non-fatal MISSING_CONCEPT note, without failing the fetch", async () => {
    const adapter = createYfinanceAdapter(makeConfig());
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    // The fixture rows never set researchDevelopment, so that concept is reported missing...
    const note = result.errors.find((e) => e.field === "incomeStatement.researchAndDevelopment");
    expect(note?.code).toBe("MISSING_CONCEPT");
    // ...while revenue, which the fixture rows do set, still comes through.
    const revenue = result.financials.incomeStatement?.annual[1]?.find((item) => item.tag === "revenue");
    expect(revenue?.value.raw).toBe(383285000000);
  });

  it("self-disables (empty fragment + SOURCE_UNAVAILABLE note, never throws) when the crumb/cookie session cannot be obtained", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ cookieStatus: 404 }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;
    expect(result.financials.incomeStatement?.annual ?? []).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("self-disables on a network error reaching quoteSummary, never throwing", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ networkErrorForQuoteSummary: true }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors[0]?.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("reports TICKER_NOT_FOUND (not a throw) when Yahoo's quoteSummary body carries an error", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ quoteSummaryBody: QUOTE_SUMMARY_NOT_FOUND_BODY }));
    const result = await adapter.fetchFinancials("NOPE");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors[0]?.code).toBe("TICKER_NOT_FOUND");
  });

  it("returns the RateLimited sentinel when the cookie endpoint 429s on every attempt", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ cookieStatus: 429 }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("yfinance");
  });

  it("returns the RateLimited sentinel when quoteSummary itself 429s", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ quoteSummaryStatus: 429 }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
  });
});

describe("createYfinanceAdapter - resolveMeta", () => {
  it("resolves identity, exchange, currency, shares and price with Tier-3 yfinance provenance", async () => {
    const adapter = createYfinanceAdapter(makeConfig());
    const result = await adapter.resolveMeta("test");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");

    expect(result.meta.ticker).toBe("TEST");
    expect(result.meta.companyName).toBe("Test Fixture Inc.");
    expect(result.meta.exchange).toBe("NasdaqGS");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.sharesOutstanding).toBe(15634232000);
    expect(result.meta.currentPrice).toBe(190.25);

    expect(result.provenance.meta.currentPrice).toMatchObject({ source: "yfinance", tier: 3 });
  });

  it("always notes that fiscalYearEnd cannot come from price/defaultKeyStatistics", async () => {
    const adapter = createYfinanceAdapter(makeConfig());
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "fiscalYearEnd");
    expect(note?.code).toBe("MISSING_FISCAL_YEAR_END");
  });

  it("self-disables cleanly (no throw) when the session cannot be obtained", async () => {
    const adapter = createYfinanceAdapter(makeConfig({ crumbStatus: 404 }));
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors[0]?.code).toBe("SOURCE_UNAVAILABLE");
    expect(result.meta).toEqual({});
  });
});

describe("createYfinanceAdapter - skip cleanly when disabled", () => {
  it("isAvailable is false once explicitly disabled, signaling the orchestrator to skip this optional source", () => {
    const adapter = createYfinanceAdapter(makeConfig());
    expect(adapter.isAvailable({ enabled: false })).toBe(false);
  });
});
