import { describe, expect, it } from "vitest";

import { isRateLimited } from "@valuation-bot/source-adapter";

import { createFmpAdapter, type FmpConfig } from "../src/fmpAdapter";
import { BALANCE_SHEET_ANNUAL, BALANCE_SHEET_QUARTERLY } from "./fixtures/balanceSheet";
import { CASH_FLOW_ANNUAL, CASH_FLOW_QUARTERLY } from "./fixtures/cashFlow";
import { INCOME_STATEMENT_ANNUAL, INCOME_STATEMENT_QUARTERLY } from "./fixtures/incomeStatement";
import { PROFILE_ROW, QUOTE_ROW } from "./fixtures/profileQuote";

const BASE_URL = "https://fmp.test/api/v3";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads. */
function response(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

const LIMIT_REACH_BODY = JSON.stringify({
  "Error Message": "Limit Reach . Please upgrade your plan or visit our documentation for more details",
});

interface StubOptions {
  /** Force a specific HTTP status for requests whose URL contains this substring (e.g. "income-statement" or "period=quarter"). */
  statusFor?: { match: string; status: number }[];
  /** Serve the FMP "limit reach" 200-body for requests whose URL contains this substring. */
  limitReachFor?: string[];
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

    if (opts.limitReachFor?.some((match) => url.includes(match))) {
      return response(200, LIMIT_REACH_BODY);
    }

    if (url.includes("/income-statement/")) {
      return response(200, JSON.stringify(url.includes("period=annual") ? INCOME_STATEMENT_ANNUAL : INCOME_STATEMENT_QUARTERLY));
    }
    if (url.includes("/balance-sheet-statement/")) {
      return response(200, JSON.stringify(url.includes("period=annual") ? BALANCE_SHEET_ANNUAL : BALANCE_SHEET_QUARTERLY));
    }
    if (url.includes("/cash-flow-statement/")) {
      return response(200, JSON.stringify(url.includes("period=annual") ? CASH_FLOW_ANNUAL : CASH_FLOW_QUARTERLY));
    }
    if (url.includes("/profile/")) {
      return response(200, JSON.stringify([PROFILE_ROW]));
    }
    if (url.includes("/quote/")) {
      return response(200, JSON.stringify([QUOTE_ROW]));
    }
    return response(404, "");
  }) as unknown as typeof fetch;
}

function makeConfig(opts: StubOptions = {}): FmpConfig {
  return {
    apiKey: "test-key",
    baseUrl: BASE_URL,
    http: { fetchImpl: stubFetch(opts), sleep: async () => {}, maxRetries: 1, baseDelayMs: 0 },
  };
}

describe("createFmpAdapter - identity", () => {
  it("is named 'fmp' at Tier 2", () => {
    const adapter = createFmpAdapter(makeConfig());
    expect(adapter.name).toBe("fmp");
    expect(adapter.tier).toBe(2);
  });

  it("isAvailable requires a non-blank API key", () => {
    const adapter = createFmpAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "   " })).toBe(false);
    expect(adapter.isAvailable({ apiKey: "abc123" })).toBe(true);
  });
});

describe("createFmpAdapter - fetchFinancials", () => {
  it("sends the API key as a query parameter on every request", async () => {
    const seenUrls: string[] = [];
    const adapter = createFmpAdapter(makeConfig({ seenUrls }));
    await adapter.fetchFinancials("TEST");
    expect(seenUrls.length).toBe(6);
    expect(seenUrls.every((url) => url.includes("apikey=test-key"))).toBe(true);
  });

  it("normalizes all three statements with per-field Tier-2 FMP provenance", async () => {
    const adapter = createFmpAdapter(makeConfig());
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
    expect(provValues.every((record) => record.source === "fmp" && record.tier === 2)).toBe(true);
  });

  it("surfaces a concept absent from every row as a non-fatal MISSING_CONCEPT note", async () => {
    const adapter = createFmpAdapter(makeConfig());
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "balanceSheet.shortTermInvestments");
    expect(note?.code).toBe("MISSING_CONCEPT");
  });

  it("folds a single failing statement endpoint into a STATEMENT_UNAVAILABLE note without failing the whole fetch", async () => {
    const adapter = createFmpAdapter(
      makeConfig({ statusFor: [{ match: "/cash-flow-statement/", status: 404 }] }),
    );
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.financials.incomeStatement?.annual.length).toBeGreaterThan(0);
    expect(result.financials.cashFlow?.annual ?? []).toEqual([]);
    const notes = result.errors.filter((e) => e.code === "STATEMENT_UNAVAILABLE");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((e) => e.field?.startsWith("cashFlow."))).toBe(true);
  });

  it("folds a network error into a STATEMENT_UNAVAILABLE note, never throwing", async () => {
    const adapter = createFmpAdapter(makeConfig({ networkErrorFor: ["/income-statement/"] }));
    const result = await adapter.fetchFinancials("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "STATEMENT_UNAVAILABLE" && e.field?.startsWith("incomeStatement."))).toBe(
      true,
    );
  });

  it("returns the RateLimited sentinel when FMP responds 429", async () => {
    const adapter = createFmpAdapter(
      makeConfig({ statusFor: [{ match: "/balance-sheet-statement/", status: 429 }] }),
    );
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("fmp");
  });

  it("returns the RateLimited sentinel when FMP responds 200 with a 'limit reach' error body", async () => {
    const adapter = createFmpAdapter(makeConfig({ limitReachFor: ["/income-statement/"] }));
    const result = await adapter.fetchFinancials("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("fmp");
  });
});

describe("createFmpAdapter - resolveMeta", () => {
  it("resolves identity, exchange, currency, shares and price with Tier-2 FMP provenance", async () => {
    const adapter = createFmpAdapter(makeConfig());
    const result = await adapter.resolveMeta("test");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");

    expect(result.meta.ticker).toBe("TEST");
    expect(result.meta.companyName).toBe("Test Fixture Inc.");
    expect(result.meta.exchange).toBe("NASDAQ");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.sharesOutstanding).toBe(15634232000);
    expect(result.meta.currentPrice).toBe(190.25);
    expect(result.meta.fetchTimestamp).not.toBeNull();

    expect(result.provenance.meta.currentPrice).toMatchObject({ source: "fmp", tier: 2 });
  });

  it("always notes that fiscalYearEnd cannot come from profile/quote", async () => {
    const adapter = createFmpAdapter(makeConfig());
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    const note = result.errors.find((e) => e.field === "fiscalYearEnd");
    expect(note?.code).toBe("MISSING_FISCAL_YEAR_END");
  });

  it("surfaces a profile failure as PROFILE_UNAVAILABLE while still resolving quote-derived fields", async () => {
    const adapter = createFmpAdapter(makeConfig({ statusFor: [{ match: "/profile/", status: 404 }] }));
    const result = await adapter.resolveMeta("TEST");
    if (isRateLimited(result)) throw new Error("unexpected rate limit");
    expect(result.errors.some((e) => e.code === "PROFILE_UNAVAILABLE")).toBe(true);
    expect(result.meta.currentPrice).toBe(190.25);
    expect(result.meta.sharesOutstanding).toBe(15634232000);
  });

  it("returns the RateLimited sentinel when the quote endpoint 429s", async () => {
    const adapter = createFmpAdapter(makeConfig({ statusFor: [{ match: "/quote/", status: 429 }] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
    if (isRateLimited(result)) expect(result.source).toBe("fmp");
  });

  it("returns the RateLimited sentinel when the profile endpoint serves a 'limit reach' body", async () => {
    const adapter = createFmpAdapter(makeConfig({ limitReachFor: ["/profile/"] }));
    const result = await adapter.resolveMeta("TEST");
    expect(isRateLimited(result)).toBe(true);
  });
});

describe("createFmpAdapter - skip cleanly with no API key", () => {
  it("isAvailable is false with an empty apiKey, signaling the orchestrator to skip this source", () => {
    const adapter = createFmpAdapter(makeConfig());
    expect(adapter.isAvailable({ apiKey: "" })).toBe(false);
  });
});
