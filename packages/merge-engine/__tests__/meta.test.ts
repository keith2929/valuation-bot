import { describe, expect, it } from "vitest";

import { createEmptyAdapterFragment, type AdapterFragment } from "@valuation-bot/source-adapter";
import type { ProvenanceRecord } from "@valuation-bot/canonical";

import { mergeMeta } from "../src/meta";
import { DEFAULT_REQUIRED_META_FIELDS, FIELD_UNFILLED_CODE, MERGE_SOURCE } from "../src/constants";

const NOW = "2026-08-01T00:00:00Z";

function prov(source: string, tier: number): ProvenanceRecord {
  return { source, tier, asOf: NOW, periodEnd: null, rawUnits: null, confidence: 1 };
}

function fragment(meta: AdapterFragment["meta"], metaProv: AdapterFragment["provenance"]["meta"] = {}): AdapterFragment {
  const base = createEmptyAdapterFragment();
  base.meta = meta;
  base.provenance.meta = metaProv;
  return base;
}

describe("mergeMeta", () => {
  it("fills each field from the first fragment that supplies a non-null value", () => {
    const a = fragment({ ticker: "SIA", currency: null }, { ticker: prov("edgar", 1) });
    const b = fragment({ ticker: "IGNORED", currency: "SGD", companyName: "SIA Ltd" }, {
      currency: prov("fmp", 2),
      companyName: prov("fmp", 2),
    });

    const result = mergeMeta([a, b], DEFAULT_REQUIRED_META_FIELDS, NOW);

    expect(result.meta.ticker).toBe("SIA");
    expect(result.meta.currency).toBe("SGD"); // a had null -> b wins
    expect(result.meta.companyName).toBe("SIA Ltd");
    expect(result.provenance.ticker?.source).toBe("edgar");
    expect(result.provenance.currency?.source).toBe("fmp");
  });

  it("treats an absent key the same as null (lower-priority source fills it)", () => {
    const a = fragment({ ticker: "SIA" }); // no exchange key at all
    const b = fragment({ exchange: "SGX" }, { exchange: prov("fmp", 2) });

    const result = mergeMeta([a, b], DEFAULT_REQUIRED_META_FIELDS, NOW);

    expect(result.meta.exchange).toBe("SGX");
    expect(result.provenance.exchange?.source).toBe("fmp");
  });

  it("emits a FIELD_UNFILLED note for each required field no source provided", () => {
    const a = fragment({ ticker: "SIA", currency: "SGD" }, {});

    const result = mergeMeta([a], DEFAULT_REQUIRED_META_FIELDS, NOW);

    const unfilled = result.errors.map((e) => e.field);
    expect(unfilled).toContain("currentPrice");
    expect(unfilled).toContain("sharesOutstanding");
    expect(unfilled).not.toContain("ticker");
    expect(unfilled).not.toContain("fetchTimestamp"); // not in default required set
    for (const error of result.errors) {
      expect(error.code).toBe(FIELD_UNFILLED_CODE);
      expect(error.source).toBe(MERGE_SOURCE);
      expect(error.timestamp).toBe(NOW);
    }
  });

  it("keeps a filled field's value even when it is 0 (0 is not 'unfilled')", () => {
    const a = fragment({ currentPrice: 0 }, { currentPrice: prov("fmp", 2) });
    const result = mergeMeta([a], DEFAULT_REQUIRED_META_FIELDS, NOW);
    expect(result.meta.currentPrice).toBe(0);
    expect(result.errors.some((e) => e.field === "currentPrice")).toBe(false);
  });
});
