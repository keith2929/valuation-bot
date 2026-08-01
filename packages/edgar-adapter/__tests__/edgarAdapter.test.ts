import { describe, expect, it } from "vitest";

import { isRateLimited } from "@valuation-bot/source-adapter";

import { createEdgarAdapter, type EdgarConfig } from "../src/edgarAdapter";
import { COMPANY_FACTS_FIXTURE } from "./fixtures/companyFacts";
import { COMPANY_TICKERS_FIXTURE } from "./fixtures/companyTickers";

const TICKERS_URL = "https://sec.test/company_tickers.json";
const FACTS_BASE = "https://sec.test/companyfacts";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads. */
function response(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

interface StubOptions {
  /** Status to return for the companyfacts request (defaults to 200 with the fixture). */
  factsStatus?: number;
  /** Force the company_tickers request to a status (e.g. 429). */
  tickersStatus?: number;
  /** Throw a network error on every request. */
  networkError?: boolean;
  /** Collects every captured request's User-Agent header. */
  seenUserAgents?: string[];
  /** Collects every requested URL, in order, so tests can assert on fetch counts. */
  seenUrls?: string[];
}

/**
 * Builds a fake `fetch` that serves the tickers fixture and the companyfacts
 * fixture by URL, capturing the User-Agent header the adapter sends.
 */
function stubFetch(opts: StubOptions = {}) {
  return (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    opts.seenUserAgents?.push(headers["User-Agent"] ?? "");
    opts.seenUrls?.push(url);

    if (opts.networkError) throw new Error("boom: connection reset");

    if (url === TICKERS_URL) {
      if (opts.tickersStatus && opts.tickersStatus !== 200) {
        return response(opts.tickersStatus, "", { "retry-after": "0" });
      }
      return response(200, JSON.stringify(COMPANY_TICKERS_FIXTURE));
    }
    // companyfacts
    const status = opts.factsStatus ?? 200;
    if (status !== 200) return response(status, "", { "retry-after": "0" });
    return response(200, JSON.stringify(COMPANY_FACTS_FIXTURE));
  }) as unknown as typeof fetch;
}

function makeConfig(opts: StubOptions = {}): EdgarConfig {
  return {
    userAgent: "Valuation Bot test@example.com",
    companyTickersUrl: TICKERS_URL,
    companyFactsBaseUrl: FACTS_BASE,
    http: { fetchImpl: stubFetch(opts), sleep: async () => {}, maxRetries: 2, baseDelayMs: 0 },
  };
}

describe("createEdgarAdapter - identity", () => {
  it("is named 'edgar' at Tier 1", () => {
    const adapter = createEdgarAdapter(makeConfig());
    expect(adapter.name).toBe("edgar");
    expect(adapter.tier).toBe(1);
  });

  it("isAvailable requires a non-empty SEC User-Agent", () => {
    const adapter = createEdgarAdapter(makeConfig());
    expect(adapter.isAvailable({ userAgent: "" })).toBe(false);
    expect(adapter.isAvailable({ userAgent: "   " })).toBe(false);
    expect(adapter.isAvailable({ userAgent: "Acme admin@acme.example" })).toBe(true);
  });
});

describe("createEdgarAdapter - fetchFinancials", () => {
  it("sends the required User-Agent header on every request", async () => {
    const seenUserAgents: string[] = [];
    const adapter = createEdgarAdapter(makeConfig({ seenUserAgents }));
    await adapter.fetchFinancials("AAPL");
    expect(seenUserAgents.length).toBeGreaterThanOrEqual(2);
    expect(seenUserAgents.every((ua) => ua === "Valuation Bot test@example.com")).toBe(true);
  });

  it("normalizes all three statements with per-field provenance", async () => {
    const adapter = createEdgarAdapter(makeConfig());
    const result = await adapter.fetchFinancials("aapl");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;

    expect(result.financials.incomeStatement?.annual).toHaveLength(3);
    expect(result.financials.balanceSheet?.annual).toHaveLength(2);
    expect(result.financials.cashFlow?.annual.length).toBeGreaterThan(0);

    const revenue = result.financials.incomeStatement?.annual[2]?.find((item) => item.tag === "revenue");
    expect(revenue?.value.raw).toBe(383285000000);

    // Provenance is populated and Tier-1 EDGAR.
    const provValues = Object.values(result.provenance.financials);
    expect(provValues.length).toBeGreaterThan(0);
    expect(provValues.every((record) => record.source === "edgar" && record.tier === 1)).toBe(true);
  });

  it("surfaces missing concepts as non-fatal error notes, never throwing", async () => {
    const adapter = createEdgarAdapter(makeConfig());
    const result = await adapter.fetchFinancials("AAPL");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const goodwillNote = result.errors.find((e) => e.field === "balanceSheet.goodwill");
    expect(goodwillNote?.code).toBe("MISSING_CONCEPT");
  });

  it("returns an error note (not a throw) for an unknown / non-US ticker", async () => {
    const adapter = createEdgarAdapter(makeConfig());
    const result = await adapter.fetchFinancials("D05");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.financials).toEqual({});
    expect(result.errors[0]?.code).toBe("CIK_NOT_FOUND");
    expect(result.errors[0]?.field).toBe("ticker");
  });

  it("returns the RateLimited sentinel when the SEC throttles the companyfacts request", async () => {
    const adapter = createEdgarAdapter(makeConfig({ factsStatus: 429 }));
    const result = await adapter.fetchFinancials("AAPL");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("edgar");
  });

  it("returns an error note when the companyfacts endpoint 404s", async () => {
    const adapter = createEdgarAdapter(makeConfig({ factsStatus: 404 }));
    const result = await adapter.fetchFinancials("AAPL");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors[0]?.code).toBe("COMPANY_FACTS_UNAVAILABLE");
  });

  it("folds a network error into an error note", async () => {
    const adapter = createEdgarAdapter(makeConfig({ networkError: true }));
    const result = await adapter.fetchFinancials("AAPL");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors[0]?.code).toBe("COMPANY_TICKERS_UNAVAILABLE");
  });
});

describe("createEdgarAdapter - company_tickers caching", () => {
  it("fetches company_tickers.json only once across repeated lookups on the same adapter", async () => {
    const seenUrls: string[] = [];
    const adapter = createEdgarAdapter(makeConfig({ seenUrls }));

    await adapter.resolveMeta("AAPL");
    await adapter.fetchFinancials("AAPL");
    await adapter.resolveMeta("aapl");

    const tickerFetches = seenUrls.filter((u) => u === TICKERS_URL);
    expect(tickerFetches).toHaveLength(1);
  });

  it("does not cache a failed company_tickers fetch, and retries it on the next call", async () => {
    const seenUrls: string[] = [];
    const adapter = createEdgarAdapter(makeConfig({ tickersStatus: 429, seenUrls }));

    const first = await adapter.resolveMeta("AAPL");
    expect(isRateLimited(first)).toBe(true);

    const tickerFetchesAfterFirst = seenUrls.filter((u) => u === TICKERS_URL).length;
    expect(tickerFetchesAfterFirst).toBeGreaterThan(0);

    await adapter.resolveMeta("AAPL");
    const tickerFetchesAfterSecond = seenUrls.filter((u) => u === TICKERS_URL).length;
    expect(tickerFetchesAfterSecond).toBeGreaterThan(tickerFetchesAfterFirst);
  });

  it("does not share the cache across independently-created adapters", async () => {
    const seenUrls: string[] = [];
    const adapterA = createEdgarAdapter(makeConfig({ seenUrls }));
    const adapterB = createEdgarAdapter(makeConfig({ seenUrls }));

    await adapterA.resolveMeta("AAPL");
    await adapterB.resolveMeta("AAPL");

    expect(seenUrls.filter((u) => u === TICKERS_URL)).toHaveLength(2);
  });

  it("refetches once the configured TTL has elapsed", async () => {
    const seenUrls: string[] = [];
    const config = makeConfig({ seenUrls });
    config.tickerCacheTtlMs = 10;
    const adapter = createEdgarAdapter(config);

    await adapter.resolveMeta("AAPL");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await adapter.resolveMeta("AAPL");

    expect(seenUrls.filter((u) => u === TICKERS_URL)).toHaveLength(2);
  });
});

describe("createEdgarAdapter - resolveMeta", () => {
  it("resolves identity, currency, fiscal year-end and shares with provenance", async () => {
    const adapter = createEdgarAdapter(makeConfig());
    const result = await adapter.resolveMeta("aapl");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");

    expect(result.meta.ticker).toBe("AAPL");
    expect(result.meta.companyName).toBe("Apple Inc.");
    expect(result.meta.exchange).toBe("US");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.fiscalYearEnd).toBe("2023-09-30");
    expect(result.meta.sharesOutstanding).toBe(15634232000);
    expect(result.meta.fetchTimestamp).not.toBeNull();

    expect(result.provenance.meta.sharesOutstanding?.rawUnits).toBe("shares");
    expect(result.provenance.meta.fiscalYearEnd?.periodEnd).toBe("2023-09-30");
  });

  it("notes that EDGAR cannot supply a market price", async () => {
    const adapter = createEdgarAdapter(makeConfig());
    const result = await adapter.resolveMeta("AAPL");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const priceNote = result.errors.find((e) => e.field === "currentPrice");
    expect(priceNote?.code).toBe("PRICE_NOT_AVAILABLE");
    expect(result.meta.currentPrice ?? null).toBeNull();
  });
});
