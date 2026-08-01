import { describe, expect, it } from "vitest";

import { HTML_SOURCE, HTML_TIER } from "../src/config";
import { createHtmlAdapter } from "../src/htmlAdapter";
import {
  BALANCE_SHEET_PAGE_NO_THEAD,
  CASH_FLOW_PAGE_RENAMED_TITLE,
  INCOME_STATEMENT_PAGE,
} from "./fixtures/pages";

function fakeFetchByUrl(handler: (url: string) => { status: number; body: string }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const { status, body } = handler(String(input));
    return new Response(body, { status });
  }) as typeof fetch;
}

describe("createHtmlAdapter", () => {
  it("conforms to the SourceAdapter contract (name, tier=4, the three methods)", () => {
    const adapter = createHtmlAdapter();
    expect(adapter.name).toBe(HTML_SOURCE);
    expect(adapter.tier).toBe(HTML_TIER);
    expect(adapter.tier).toBe(4);
    expect(typeof adapter.isAvailable).toBe("function");
    expect(typeof adapter.resolveMeta).toBe("function");
    expect(typeof adapter.fetchFinancials).toBe("function");
  });

  it("isAvailable is true without any credentials (last-resort scraper)", () => {
    expect(createHtmlAdapter().isAvailable({})).toBe(true);
  });

  it("resolveMeta returns an empty-but-canonical fragment with META_NOT_AVAILABLE notes, never throwing", async () => {
    const result = await createHtmlAdapter().resolveMeta("AAPL");
    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    expect(result.meta).toEqual({});
    expect(result.financials).toEqual({});
    expect(result.provenance).toEqual({ meta: {}, financials: {} });
    expect(result.errors.every((e) => e.source === HTML_SOURCE && e.code === "META_NOT_AVAILABLE")).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fetchFinancials maps scraped tables into a canonical fragment with html/tier-4 provenance", async () => {
    const fetchImpl = fakeFetchByUrl((url) => {
      if (url.includes("/balance-sheet/")) return { status: 200, body: BALANCE_SHEET_PAGE_NO_THEAD };
      if (url.includes("/cash-flow-statement/")) return { status: 200, body: CASH_FLOW_PAGE_RENAMED_TITLE };
      return { status: 200, body: INCOME_STATEMENT_PAGE };
    });

    const result = await createHtmlAdapter({ http: { fetchImpl } }).fetchFinancials("AAPL");
    if ("rateLimited" in result) throw new Error("unexpected rate limit");

    expect(result.financials.incomeStatement?.annual.length).toBeGreaterThan(0);
    const provenanceRecords = Object.values(result.provenance.financials);
    expect(provenanceRecords.length).toBeGreaterThan(0);
    expect(provenanceRecords.every((p) => p.source === HTML_SOURCE && p.tier === HTML_TIER)).toBe(true);
  });

  it("on a forced scrape failure (every page 404s) returns a canonical-shaped fragment with error notes, not a throw", async () => {
    const fetchImpl = fakeFetchByUrl(() => ({ status: 404, body: "not found" }));

    const result = await createHtmlAdapter({ http: { fetchImpl, maxRetries: 0 } }).fetchFinancials("NOSUCHTICKER");
    if ("rateLimited" in result) throw new Error("unexpected rate limit");

    // Canonical shape preserved: no data, but all fragment fields present.
    expect(result.meta).toEqual({});
    expect(result.financials).toEqual({});
    expect(result.provenance).toEqual({ meta: {}, financials: {} });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.source === HTML_SOURCE)).toBe(true);
  });

  it("short-circuits with the RateLimited sentinel on a 429", async () => {
    const fetchImpl = fakeFetchByUrl(() => ({ status: 429, body: "slow down" }));

    const result = await createHtmlAdapter({ http: { fetchImpl, maxRetries: 0 } }).fetchFinancials("AAPL");
    expect(result).toMatchObject({ rateLimited: true, source: HTML_SOURCE });
  });
});
