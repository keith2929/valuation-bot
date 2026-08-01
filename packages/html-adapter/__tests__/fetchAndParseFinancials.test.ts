import { describe, expect, it } from "vitest";

import { fetchAndParseFinancials } from "../src/fetchAndParseFinancials";
import {
  BALANCE_SHEET_PAGE_NO_THEAD,
  CASH_FLOW_PAGE_RENAMED_TITLE,
  INCOME_STATEMENT_PAGE,
  PAGE_WITH_NO_TABLES,
} from "./fixtures/pages";

function fakeFetchByUrl(handler: (url: string) => { status: number; body: string }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const { status, body } = handler(String(input));
    return new Response(body, { status });
  }) as typeof fetch;
}

describe("fetchAndParseFinancials", () => {
  it("fetches and classifies all three statements when every page resolves cleanly", async () => {
    const fetchImpl = fakeFetchByUrl((url) => {
      if (url.includes("/balance-sheet/")) return { status: 200, body: BALANCE_SHEET_PAGE_NO_THEAD };
      if (url.includes("/cash-flow-statement/")) return { status: 200, body: CASH_FLOW_PAGE_RENAMED_TITLE };
      return { status: 200, body: INCOME_STATEMENT_PAGE };
    });

    const result = await fetchAndParseFinancials("AAPL", { http: { fetchImpl } });

    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    expect(result.tables.incomeStatement?.rows.map((r) => r.label)).toContain("Revenue");
    expect(result.tables.balanceSheet?.rows.map((r) => r.label)).toContain("Total Assets");
    expect(result.tables.cashFlow?.rows.map((r) => r.label)).toContain("Operating Cash Flow");
    expect(result.errors).toEqual([]);
  });

  it("degrades one missing/unrecognizable statement to null + an error note without failing the others", async () => {
    const fetchImpl = fakeFetchByUrl((url) => {
      if (url.includes("/balance-sheet/")) return { status: 200, body: PAGE_WITH_NO_TABLES };
      if (url.includes("/cash-flow-statement/")) return { status: 200, body: CASH_FLOW_PAGE_RENAMED_TITLE };
      return { status: 200, body: INCOME_STATEMENT_PAGE };
    });

    const result = await fetchAndParseFinancials("AAPL", { http: { fetchImpl } });

    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    expect(result.tables.incomeStatement).not.toBeNull();
    expect(result.tables.balanceSheet).toBeNull();
    expect(result.errors.some((e) => e.field === "balanceSheet")).toBe(true);
  });

  it("records a fetch-failure error and continues to the remaining statements on a 500", async () => {
    const fetchImpl = fakeFetchByUrl((url) => {
      if (url.includes("/financials/") && !url.includes("balance-sheet") && !url.includes("cash-flow")) {
        return { status: 500, body: "server error" };
      }
      if (url.includes("/balance-sheet/")) return { status: 200, body: BALANCE_SHEET_PAGE_NO_THEAD };
      return { status: 200, body: CASH_FLOW_PAGE_RENAMED_TITLE };
    });

    const result = await fetchAndParseFinancials("AAPL", { http: { fetchImpl, maxRetries: 0 } });

    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    expect(result.tables.incomeStatement).toBeNull();
    expect(result.errors.some((e) => e.field === "incomeStatement" && e.message.includes("failed to fetch"))).toBe(
      true,
    );
    expect(result.tables.balanceSheet).not.toBeNull();
  });

  it("short-circuits with the RateLimited sentinel on a 429, never throwing", async () => {
    const fetchImpl = fakeFetchByUrl(() => ({ status: 429, body: "slow down" }));

    const result = await fetchAndParseFinancials("AAPL", { http: { fetchImpl, maxRetries: 0 } });

    expect(result).toMatchObject({ rateLimited: true, source: "html" });
  });

  it("never throws even when every page 404s", async () => {
    const fetchImpl = fakeFetchByUrl(() => ({ status: 404, body: "not found" }));

    const result = await fetchAndParseFinancials("NOSUCHTICKER", { http: { fetchImpl, maxRetries: 0 } });

    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    expect(result.tables).toEqual({ incomeStatement: null, balanceSheet: null, cashFlow: null });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
