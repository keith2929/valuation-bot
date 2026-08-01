import { describe, expect, it } from "vitest";

import { isRateLimited } from "@valuation-bot/source-adapter";

import { createAlphaVantageAdapter, type AlphaVantageConfig } from "../src/alphaVantageAdapter";
import { BALANCE_SHEET_ANNUAL, BALANCE_SHEET_QUARTERLY } from "./fixtures/balanceSheet";
import { CASH_FLOW_ANNUAL, CASH_FLOW_QUARTERLY } from "./fixtures/cashFlow";
import { INCOME_STATEMENT_ANNUAL, INCOME_STATEMENT_QUARTERLY } from "./fixtures/incomeStatement";
import { OVERVIEW_ROW, QUOTE_ROW } from "./fixtures/overviewQuote";

const BASE_URL = "https://av.test/query";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads. */
function response(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

const NOTE_BODY = JSON.stringify({
  Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 25 requests per day. Please subscribe to any of the premium plans to instantly remove all daily rate limits.",
});

const INFORMATION_RATE_LIMIT_BODY = JSON.stringify({
  Information:
    "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day. Please subscribe to a premium plan to target a higher API call frequency.",
});

const INVALID_CALL_BODY = JSON.stringify({
  "Error Message": "Invalid API call. Please retry or visit the documentation for INCOME_STATEMENT.",
});

interface StubOptions {
  /** Force a specific HTTP status for requests whose URL contains this substring (e.g. "function=INCOME_STATEMENT"). */
  statusFor?: { match: string; status: number }[];
  /** Serve a throttle/error body for requests whose URL contains this substring. */
  bodyFor?: { match: string; body: string }[];
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

    const forcedBody = opts.bodyFor?.find((entry) => url.includes(entry.match))?.body;
    if (forcedBody !== undefined) {
      return response(200, forcedBody);
    }

    if (url.includes("function=INCOME_STATEMENT")) {
      return response(200, JSON.stringify({ symbol: "TEST", annualReports: INCOME_STATEMENT_ANNUAL, quarterlyReports: INCOME_STATEMENT_QUARTERLY }));
    }
    if (url.includes("function=BALANCE_SHEET")) {
      return response(200, JSON.stringify({ symbol: "TEST", annualReports: BALANCE_SHEET_ANNUAL, quarterlyReports: BALANCE_SHEET_QUARTERLY }));
    }
    if (url.includes("function=CASH_FLOW")) {
      return response(200, JSON.stringify({ symbol: "TEST", annualReports: CASH_FLOW_ANNUAL, quarterlyReports: CASH_FLOW_QUARTERLY }));
    }
    if (url.includes("function=OVERVIEW")) {
      return response(200, JSON.stringify(OVERVIEW_ROW));
    }
    if (url.includes("function=GLOBAL_QUOTE")) {
      return response(200, JSON.stringify({ "Global Quote": QUOTE_ROW }));
    }
    return response(404, "");
  }) as unknown as typeof fetch;
}

function makeConfig(opts: StubOptions = {}): AlphaVantageConfig {
  return {
    apiKey: "test-key",
    baseUrl: BASE_URL,
    http: { fetchImpl: stubFetch(opts), sleep: async () => {}, maxRetries: 1, baseDelayMs: 0 },
  };
}

describe("createAlphaVantageAdapter - identity", () => {
  it("is named 'alphavantage' at Tier 2", () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    expect(adapter.name).toBe("alphavantage");
    expect(adapter.tier).toBe(2);
  });

  it("isAvailable requires a non-blank API key", () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "   " })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "abc123" })).toBe(true);
  });
});

describe("createAlphaVantageAdapter - fetchFinancials", () => {
  it("sends the API key as a query parameter on 3 requests (one per statement, annual+quarterly combined)", async () => {
    const seenUrls: string[] = [];
    const adapter = createAlphaVantageAdapter(makeConfig({ seenUrls }));
    await adapter.fetchFinancials("TEST");
    expect(seenUrls.length).toBe(3);
    expect(seenUrls.every((url) => url.includes("apikey=test-key"))).toBe(true);
  });

  it("normalizes all three statements with per-field Tier-2 Alpha Vantage provenance", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    const result = await adapter.fetchFinancials("test");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;

    expect(result.financials.incomeStatement?.annual).toHaveLength(3);
    expect(result.financials.balanceSheet?.annual).toHaveLength(2);
    expect(result.financials.cashFlow?.annual).toHaveLength(2);

    const revenue = result.financials.incomeStatement?.annual[2]?.find((item) => item.tag === "revenue");
    expect(revenue?.value.raw).toBe(383285000000);

    const provValues = Object.values(result.provenance.financials);
    expect(provValues.length).toBeGreaterThan(0);
    expect(provValues.every((record) => record.source === "alphavantage" && record.tier === 2)).toBe(true);
  });

  it("surfaces a concept absent (or always \"None\") from every row as a non-fatal MISSING_CONCEPT note", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "balanceSheet.shortTermInvestments");
    expect(note?.code).toBe("MISSING_CONCEPT");
  });

  it("folds a single failing statement endpoint into a STATEMENT_UNAVAILABLE note without failing the whole fetch", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ statusFor: [{ match: "function=CASH_FLOW", status: 404 }] }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.financials.incomeStatement?.annual.length).toBeGreaterThan(0);
    expect(result.financials.cashFlow?.annual ?? []).toEqual([]);
    const notes = result.errors.filter((e) => e.code === "STATEMENT_UNAVAILABLE");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((e) => e.field === "cashFlow")).toBe(true);
  });

  it("folds a network error into a STATEMENT_UNAVAILABLE note, never throwing", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ networkErrorFor: ["function=INCOME_STATEMENT"] }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "STATEMENT_UNAVAILABLE" && e.field === "incomeStatement")).toBe(true);
  });

  it("folds a non-rate-limit 'Error Message' body into a non-fatal STATEMENT_UNAVAILABLE note, not a RateLimited sentinel", async () => {
    const adapter = createAlphaVantageAdapter(
      makeConfig({ bodyFor: [{ match: "function=INCOME_STATEMENT", body: INVALID_CALL_BODY }] }),
    );
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(false);
    if (isRateLimited(result)) return;
    expect(result.errors.some((e) => e.code === "STATEMENT_UNAVAILABLE" && e.field === "incomeStatement")).toBe(true);
  });

  it("returns the RateLimited sentinel when Alpha Vantage responds 429", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ statusFor: [{ match: "function=BALANCE_SHEET", status: 429 }] }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("alphavantage");
  });

  it("returns the RateLimited sentinel when Alpha Vantage responds 200 with a 'Note' throttle body", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ bodyFor: [{ match: "function=INCOME_STATEMENT", body: NOTE_BODY }] }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("alphavantage");
  });

  it("returns the RateLimited sentinel when Alpha Vantage responds 200 with a rate-limit-worded 'Information' body", async () => {
    const adapter = createAlphaVantageAdapter(
      makeConfig({ bodyFor: [{ match: "function=CASH_FLOW", body: INFORMATION_RATE_LIMIT_BODY }] }),
    );
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("alphavantage");
  });
});

describe("createAlphaVantageAdapter - resolveMeta", () => {
  it("resolves identity, exchange, currency, shares and price with Tier-2 Alpha Vantage provenance", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    const result = await adapter.resolveMeta("test");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");

    expect(result.meta.ticker).toBe("TEST");
    expect(result.meta.companyName).toBe("Test Fixture Inc.");
    expect(result.meta.exchange).toBe("NASDAQ");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.sharesOutstanding).toBe(15634232000);
    expect(result.meta.currentPrice).toBe(190.25);
    expect(result.meta.fetchTimestamp).not.toBeNull();

    expect(result.provenance.meta.currentPrice).toMatchObject({ source: "alphavantage", tier: 2 });
  });

  it("always notes that fiscalYearEnd cannot come from OVERVIEW as a full date", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "fiscalYearEnd");
    expect(note?.code).toBe("MISSING_FISCAL_YEAR_END");
  });

  it("treats an empty {} OVERVIEW body (unknown symbol) as no data, not a parseable row", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ bodyFor: [{ match: "function=OVERVIEW", body: "{}" }] }));
    const result = await adapter.resolveMeta("UNKNOWNTICKER");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.meta.companyName).toBeUndefined();
    expect(result.errors.some((e) => e.code === "MISSING_COMPANY_NAME")).toBe(true);
  });

  it("surfaces an overview failure as OVERVIEW_UNAVAILABLE while still resolving quote-derived fields", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ statusFor: [{ match: "function=OVERVIEW", status: 404 }] }));
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "OVERVIEW_UNAVAILABLE")).toBe(true);
    expect(result.meta.currentPrice).toBe(190.25);
  });

  it("returns the RateLimited sentinel when the quote endpoint 429s", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ statusFor: [{ match: "function=GLOBAL_QUOTE", status: 429 }] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("alphavantage");
  });

  it("returns the RateLimited sentinel when the overview endpoint serves a 'Note' throttle body", async () => {
    const adapter = createAlphaVantageAdapter(makeConfig({ bodyFor: [{ match: "function=OVERVIEW", body: NOTE_BODY }] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
  });
});

describe("createAlphaVantageAdapter - skip cleanly with no API key", () => {
  it("isAvailable is false with an empty apiKey, signaling the orchestrator to skip this source", () => {
    const adapter = createAlphaVantageAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
  });
});
