import { describe, expect, it } from "vitest";

import {
  adapterError,
  createEmptyAdapterFragment,
  isRateLimited,
  rateLimited,
  type AdapterConfig,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "../src/adapter";

interface FakeConfig extends AdapterConfig {
  apiKey?: string;
  shouldRateLimit?: boolean;
}

function createFakeAdapter(config: FakeConfig): SourceAdapter<FakeConfig> {
  return {
    name: "fake-source",
    tier: 3,
    isAvailable(cfg) {
      return typeof cfg.apiKey === "string" && cfg.apiKey.length > 0;
    },
    async resolveMeta(ticker): Promise<ResolveMetaResult> {
      if (config.shouldRateLimit) {
        return rateLimited("fake-source", 5000);
      }
      const fragment = createEmptyAdapterFragment();
      fragment.meta.ticker = ticker;
      fragment.meta.companyName = null;
      fragment.provenance.meta.companyName = {
        source: "fake-source",
        tier: 3,
        asOf: "2026-01-01T00:00:00Z",
        periodEnd: null,
        rawUnits: null,
        confidence: null,
      };
      fragment.errors.push(adapterError("fake-source", "companyName not found", { field: "companyName" }));
      return fragment;
    },
    async fetchFinancials(): Promise<FetchFinancialsResult> {
      if (config.shouldRateLimit) {
        return rateLimited("fake-source", null);
      }
      return createEmptyAdapterFragment();
    },
  };
}

describe("SourceAdapter contract", () => {
  it("isAvailable reflects whether config has what the adapter needs", () => {
    const adapter = createFakeAdapter({});
    expect(adapter.isAvailable({})).toBe(false);
    expect(adapter.isAvailable({ apiKey: "abc" })).toBe(true);
  });

  it("resolveMeta returns a partial fragment with provenance and non-fatal errors, never throwing", async () => {
    const adapter = createFakeAdapter({});
    const result = await adapter.resolveMeta("D05");

    expect(isRateLimited(result)).toBe(false);
    if (!isRateLimited(result)) {
      expect(result.meta.ticker).toBe("D05");
      expect(result.meta.companyName).toBeNull();
      expect(result.provenance.meta.companyName?.source).toBe("fake-source");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ source: "fake-source", field: "companyName" });
    }
  });

  it("surfaces the rateLimited sentinel instead of a fragment when the source is throttled", async () => {
    const adapter = createFakeAdapter({ shouldRateLimit: true });
    const metaResult = await adapter.resolveMeta("D05");
    const financialsResult = await adapter.fetchFinancials("D05");

    expect(isRateLimited(metaResult)).toBe(true);
    expect(isRateLimited(financialsResult)).toBe(true);
    if (isRateLimited(metaResult)) {
      expect(metaResult.source).toBe("fake-source");
      expect(metaResult.retryAfterMs).toBe(5000);
    }
  });

  it("createEmptyAdapterFragment starts fully empty", () => {
    const fragment = createEmptyAdapterFragment();
    expect(fragment).toEqual({
      meta: {},
      financials: {},
      provenance: { meta: {}, financials: {} },
      errors: [],
    });
  });

  it("adapterError defaults code/field to null and stamps a timestamp", () => {
    const error = adapterError("fake-source", "boom");
    expect(error.code).toBeNull();
    expect(error.field).toBeNull();
    expect(() => new Date(error.timestamp).toISOString()).not.toThrow();
  });
});
