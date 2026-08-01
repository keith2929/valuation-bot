import { describe, expect, it } from "vitest";

import {
  createEmptyAdapterFragment,
  rateLimited,
  type AdapterConfig,
  type AdapterFragment,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";
import {
  provenanceKey,
  type CanonicalMeta,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";

import {
  fetchFinancials,
  NO_ELIGIBLE_SOURCES_CODE,
  SOURCE_FAILED_CODE,
  SOURCE_RATE_LIMITED_CODE,
  SOURCE_UNAVAILABLE_CODE,
  UNRESOLVED_MARKET_CODE,
} from "../src/orchestrator";
import type { AdapterRegistration } from "../src/registry";

const NOW = "2026-08-01T00:00:00Z";
const FIELD_UNFILLED = "FIELD_UNFILLED";

function rec(source: string, tier: number): ProvenanceRecord {
  return { source, tier, asOf: NOW, periodEnd: null, rawUnits: null, confidence: 1 };
}

function metaFragment(
  source: string,
  tier: number,
  meta: Partial<CanonicalMeta>,
): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  fragment.meta = meta;
  for (const field of Object.keys(meta)) fragment.provenance.meta[field] = rec(source, tier);
  return fragment;
}

/** A financials fragment with a single annual income-statement "revenue" line item. */
function revenueFragment(source: string, tier: number, revenue: number): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  fragment.financials = {
    incomeStatement: {
      annual: [
        [
          {
            tag: "revenue",
            label: "Revenue",
            value: { raw: revenue, units: "millions", currency: "USD", periodEnd: "2025-12-31" },
          },
        ],
      ],
      quarterly: [],
      ltm: null,
    },
    balanceSheet: { annual: [], quarterly: [], ltm: null },
    cashFlow: { annual: [], quarterly: [], ltm: null },
  };
  fragment.provenance.financials[provenanceKey("incomeStatement", "annual", 0, "revenue")] = rec(
    source,
    tier,
  );
  return fragment;
}

interface Handlers {
  available?: boolean;
  resolveMeta?: (ticker: string) => ResolveMetaResult;
  fetchFinancials?: (ticker: string) => FetchFinancialsResult;
}

/** Builds a fake registration whose `isAvailable` reads `config.available`, tying config to the adapter as the real ones do. */
function reg(name: string, tier: number, handlers: Handlers = {}): AdapterRegistration {
  const config: AdapterConfig = { available: handlers.available ?? true };
  const adapter: SourceAdapter<AdapterConfig> = {
    name,
    tier,
    isAvailable: (cfg) => (cfg as { available?: boolean }).available !== false,
    async resolveMeta(ticker: string): Promise<ResolveMetaResult> {
      return handlers.resolveMeta ? handlers.resolveMeta(ticker) : createEmptyAdapterFragment();
    },
    async fetchFinancials(ticker: string): Promise<FetchFinancialsResult> {
      return handlers.fetchFinancials
        ? handlers.fetchFinancials(ticker)
        : createEmptyAdapterFragment();
    },
  };
  return { adapter, config };
}

describe("fetchFinancials", () => {
  it("runs eligible adapters and merges their fragments into one canonical record", async () => {
    const edgar = reg("edgar", 1, {
      resolveMeta: () => metaFragment("edgar", 1, { companyName: "Apple", currency: "USD", currentPrice: 100 }),
    });
    const fmp = reg("fmp", 2, {
      fetchFinancials: () => revenueFragment("fmp", 2, 383285),
    });

    const result = await fetchFinancials("AAPL", { adapters: [edgar, fmp], now: NOW });

    expect(result.meta.companyName).toBe("Apple");
    expect(result.meta.currency).toBe("USD");
    expect(result.meta.currentPrice).toBe(100);
    // exchange + ticker backfilled from the resolved market / normalized symbol.
    expect(result.meta.exchange).toBe("US");
    expect(result.meta.ticker).toBe("AAPL");
    expect(result.meta.fetchTimestamp).toBe(NOW);
    // financials came from the fmp fragment.
    expect(result.financials.incomeStatement.annual[0]?.[0]?.value.raw).toBe(383285);
    // provenance carried from the winning source.
    expect(result.provenance.meta.currentPrice?.source).toBe("edgar");
    // exchange/ticker are filled, so no FIELD_UNFILLED note for them.
    const unfilledFields = result.errors
      .filter((e) => e.code === FIELD_UNFILLED)
      .map((e) => e.field);
    expect(unfilledFields).not.toContain("exchange");
    expect(unfilledFields).not.toContain("ticker");
  });

  it("orders strictly by tier regardless of input order: the lower tier wins a contested field", async () => {
    const edgar = reg("edgar", 1, {
      resolveMeta: () => metaFragment("edgar", 1, { currentPrice: 200 }),
    });
    const fmp = reg("fmp", 2, {
      resolveMeta: () => metaFragment("fmp", 2, { currentPrice: 100 }),
    });

    // fmp listed first, but edgar (tier 1) must still win the field.
    const result = await fetchFinancials("AAPL", { adapters: [fmp, edgar], now: NOW });

    expect(result.meta.currentPrice).toBe(200);
    expect(result.provenance.meta.currentPrice?.source).toBe("edgar");
  });

  it("skips and records an unavailable source, still merging the available ones", async () => {
    const edgar = reg("edgar", 1, {
      available: false,
      resolveMeta: () => metaFragment("edgar", 1, { currentPrice: 999 }),
    });
    const fmp = reg("fmp", 2, {
      resolveMeta: () => metaFragment("fmp", 2, { currentPrice: 100 }),
    });

    const result = await fetchFinancials("AAPL", { adapters: [edgar, fmp], now: NOW });

    // edgar was skipped (unavailable), so fmp's price wins.
    expect(result.meta.currentPrice).toBe(100);
    const unavailable = result.errors.find((e) => e.code === SOURCE_UNAVAILABLE_CODE);
    expect(unavailable?.message).toContain("edgar");
  });

  it("treats a rate-limited call as a non-fatal skip, keeping the other call's fragment", async () => {
    const edgar = reg("edgar", 1, {
      resolveMeta: () => rateLimited("edgar", 1500),
      fetchFinancials: () => revenueFragment("edgar", 1, 42),
    });

    const result = await fetchFinancials("AAPL", { adapters: [edgar], now: NOW });

    const limited = result.errors.find((e) => e.code === SOURCE_RATE_LIMITED_CODE);
    expect(limited?.message).toContain("edgar");
    expect(limited?.message).toContain("1500");
    // fetchFinancials still succeeded, so its financials survived.
    expect(result.financials.incomeStatement.annual[0]?.[0]?.value.raw).toBe(42);
  });

  it("absorbs an adapter that throws, recording it and never rejecting", async () => {
    const edgar = reg("edgar", 1, {
      resolveMeta: () => {
        throw new Error("boom");
      },
      fetchFinancials: () => revenueFragment("edgar", 1, 7),
    });

    const result = await fetchFinancials("AAPL", { adapters: [edgar], now: NOW });

    const failed = result.errors.find((e) => e.code === SOURCE_FAILED_CODE);
    expect(failed?.message).toContain("edgar");
    expect(failed?.message).toContain("boom");
    // The sibling call still contributed.
    expect(result.financials.incomeStatement.annual[0]?.[0]?.value.raw).toBe(7);
  });

  it("passes the normalized (suffix-stripped) ticker to adapters", async () => {
    const seen: string[] = [];
    const fmp = reg("fmp", 2, {
      resolveMeta: (ticker) => {
        seen.push(ticker);
        return createEmptyAdapterFragment();
      },
    });

    await fetchFinancials("O39.SI", { adapters: [fmp], now: NOW });

    expect(seen).toContain("O39");
  });

  it("returns a non-fatal note (no throw) when no adapter is eligible for the market", async () => {
    const stray = reg("not-a-registered-source", 1, {
      resolveMeta: () => metaFragment("x", 1, { currentPrice: 5 }),
    });

    const result = await fetchFinancials("AAPL", { adapters: [stray], now: NOW });

    expect(result.errors.some((e) => e.code === NO_ELIGIBLE_SOURCES_CODE)).toBe(true);
    // Routing still populated the exchange.
    expect(result.meta.exchange).toBe("US");
    // The stray adapter never ran.
    expect(result.meta.currentPrice).toBeNull();
  });

  it("falls through to the HTML source only once every higher tier is unavailable/failing, filling a field with tier-4 html provenance", async () => {
    const edgar = reg("edgar", 1, { available: false });
    const fmp = reg("fmp", 2, {
      resolveMeta: () => {
        throw new Error("fmp exploded");
      },
    });
    const alphavantage = reg("alphavantage", 2, {
      fetchFinancials: () => rateLimited("alphavantage", 5000),
    });
    const polygon = reg("polygon", 2, { available: false });
    const yfinance = reg("yfinance", 3, { available: false });
    const html = reg("html", 4, {
      fetchFinancials: () => revenueFragment("html", 4, 12345),
    });

    const result = await fetchFinancials("AAPL", {
      adapters: [edgar, fmp, alphavantage, polygon, yfinance, html],
      now: NOW,
    });

    // The HTML fragment's field survived the merge with the right provenance.
    expect(result.financials.incomeStatement.annual[0]?.[0]?.value.raw).toBe(12345);
    const revenueProvenance =
      result.provenance.financials[provenanceKey("incomeStatement", "annual", 0, "revenue")];
    expect(revenueProvenance?.source).toBe("html");
    expect(revenueProvenance?.tier).toBe(4);

    // Every higher tier was recorded as skipped/failed, never as a throw out of fetchFinancials.
    expect(result.errors.some((e) => e.code === SOURCE_UNAVAILABLE_CODE && e.message.includes("edgar"))).toBe(true);
    expect(result.errors.some((e) => e.code === SOURCE_FAILED_CODE && e.message.includes("fmp"))).toBe(true);
    expect(result.errors.some((e) => e.code === SOURCE_RATE_LIMITED_CODE && e.message.includes("alphavantage"))).toBe(true);
    expect(result.errors.some((e) => e.code === SOURCE_UNAVAILABLE_CODE && e.message.includes("polygon"))).toBe(true);
    expect(result.errors.some((e) => e.code === SOURCE_UNAVAILABLE_CODE && e.message.includes("yfinance"))).toBe(true);
  });

  it("registers the real HTML adapter last, in createDefaultAdapters", async () => {
    const { createDefaultAdapters } = await import("../src/registry");
    const registrations = createDefaultAdapters();
    expect(registrations[registrations.length - 1]?.adapter.name).toBe("html");
    expect(registrations[registrations.length - 1]?.adapter.tier).toBe(4);
  });

  it("returns a non-fatal note (no throw) when the market cannot be resolved", async () => {
    const edgar = reg("edgar", 1, {
      resolveMeta: () => metaFragment("edgar", 1, { currentPrice: 1 }),
    });

    const result = await fetchFinancials("1234567890", { adapters: [edgar], now: NOW });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe(UNRESOLVED_MARKET_CODE);
    expect(result.meta.ticker).toBe("1234567890");
    expect(result.meta.fetchTimestamp).toBe(NOW);
    expect(result.financials.incomeStatement.annual).toHaveLength(0);
  });
});
