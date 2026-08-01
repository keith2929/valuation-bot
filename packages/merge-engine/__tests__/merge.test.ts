import { describe, expect, it } from "vitest";

import { createEmptyAdapterFragment, adapterError, type AdapterFragment } from "@valuation-bot/source-adapter";
import { provenanceKey, type ProvenanceRecord } from "@valuation-bot/canonical";

import { mergeFragments } from "../src/merge";
import { FIELD_UNFILLED_CODE, MERGE_SOURCE } from "../src/constants";

const NOW = "2026-08-01T00:00:00Z";

function rec(source: string, tier: number): ProvenanceRecord {
  return { source, tier, asOf: NOW, periodEnd: null, rawUnits: null, confidence: 1 };
}

describe("mergeFragments", () => {
  it("assembles meta, financials, provenance and errors from ordered fragments", () => {
    const metaFrag: AdapterFragment = createEmptyAdapterFragment();
    metaFrag.meta = { ticker: "SIA", companyName: "Singapore Airlines", exchange: "SGX", currency: "SGD" };
    metaFrag.provenance.meta = { ticker: rec("edgar", 1), currency: rec("edgar", 1) };

    const finFrag: AdapterFragment = createEmptyAdapterFragment();
    finFrag.financials = {
      incomeStatement: {
        annual: [[{ tag: "revenue", label: "Revenue", value: { raw: 200, units: "ones", currency: "SGD", periodEnd: "2024-12-31" } }]],
        quarterly: [],
        ltm: null,
      },
    };
    finFrag.provenance.financials = { [provenanceKey("incomeStatement", "annual", 0, "revenue")]: rec("fmp", 2) };
    finFrag.errors = [adapterError("fmp", "currentPrice unavailable", { timestamp: NOW })];

    const result = mergeFragments([metaFrag, finFrag], { now: NOW });

    expect(result.meta.ticker).toBe("SIA");
    expect(result.meta.fetchTimestamp).toBe(NOW); // backfilled
    expect(result.financials.incomeStatement.annual[0]?.[0]?.value.raw).toBe(200);
    expect(result.provenance.meta.ticker?.source).toBe("edgar");
    expect(result.provenance.financials[provenanceKey("incomeStatement", "annual", 0, "revenue")]?.source).toBe("fmp");

    // Fragment errors come first, then FIELD_UNFILLED notes.
    expect(result.errors[0]?.message).toBe("currentPrice unavailable");
    const unfilled = result.errors.filter((e) => e.code === FIELD_UNFILLED_CODE);
    expect(unfilled.every((e) => e.source === MERGE_SOURCE)).toBe(true);
    expect(unfilled.map((e) => e.field)).toContain("currentPrice");
  });

  it("is deterministic: same inputs + now => deep-equal outputs", () => {
    const frag = createEmptyAdapterFragment();
    frag.meta = { ticker: "SIA" };
    const one = mergeFragments([frag], { now: NOW });
    const two = mergeFragments([frag], { now: NOW });
    expect(one).toEqual(two);
  });

  it("does not mutate the input fragments", () => {
    const frag = createEmptyAdapterFragment();
    frag.meta = { ticker: "SIA" };
    const snapshot = JSON.stringify(frag);
    mergeFragments([frag], { now: NOW });
    expect(JSON.stringify(frag)).toBe(snapshot);
  });

  it("honours a custom requiredMetaFields set", () => {
    const frag = createEmptyAdapterFragment();
    const result = mergeFragments([frag], { now: NOW, requiredMetaFields: ["ticker"] });
    const unfilled = result.errors.filter((e) => e.code === FIELD_UNFILLED_CODE);
    expect(unfilled.map((e) => e.field)).toEqual(["ticker"]);
  });

  it("produces an all-null meta (fetchTimestamp aside) for an empty fragment list", () => {
    const result = mergeFragments([], { now: NOW });
    expect(result.meta.ticker).toBeNull();
    expect(result.meta.fetchTimestamp).toBe(NOW);
    expect(result.errors.every((e) => e.code === FIELD_UNFILLED_CODE)).toBe(true);
  });
});
