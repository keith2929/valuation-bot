import { describe, expect, it } from "vitest";

import { createEmptyAdapterFragment, type AdapterFragment } from "@valuation-bot/source-adapter";
import {
  provenanceKey,
  type CanonicalLineItem,
  type CanonicalStatementPeriod,
  type PeriodFrequency,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";

import { mergeFinancials } from "../src/financials";

function record(source: string, tier: number, periodEnd: string | null): ProvenanceRecord {
  return { source, tier, asOf: "2026-08-01T00:00:00Z", periodEnd, rawUnits: "ones", confidence: 1 };
}

function line(tag: string | null, label: string, raw: number | null, periodEnd: string): CanonicalLineItem {
  return { tag, label, value: { raw, units: "ones", currency: "SGD", periodEnd } };
}

/**
 * Builds a fragment holding one statement (default incomeStatement) with the
 * given annual periods, and provenance for every tagged, non-null line item
 * keyed by that fragment's own period index.
 */
function incomeFragment(
  source: string,
  tier: number,
  annual: CanonicalStatementPeriod[],
): AdapterFragment {
  const base = createEmptyAdapterFragment();
  base.financials = { incomeStatement: { annual, quarterly: [], ltm: null } };
  annual.forEach((period, index) => {
    for (const item of period) {
      if (item.tag !== null && item.value.raw !== null) {
        base.provenance.financials[provenanceKey("incomeStatement", "annual", index, item.tag)] = record(
          source,
          tier,
          item.value.periodEnd,
        );
      }
    }
  });
  return base;
}

describe("mergeFinancials", () => {
  it("unions annual history without truncating below the longest source", () => {
    // Source A (tier 1) has only 2 recent years; source B (tier 2) has 4 years.
    const a = incomeFragment("edgar", 1, [
      [line("revenue", "Revenue", 200, "2023-12-31")],
      [line("revenue", "Revenue", 210, "2024-12-31")],
    ]);
    const b = incomeFragment("fmp", 2, [
      [line("revenue", "Revenue", 170, "2021-12-31")],
      [line("revenue", "Revenue", 180, "2022-12-31")],
      [line("revenue", "Revenue", 999, "2023-12-31")],
      [line("revenue", "Revenue", 888, "2024-12-31")],
    ]);

    const { financials, provenance } = mergeFinancials([a, b]);
    const annual = financials.incomeStatement.annual;

    // 4 distinct years, oldest -> newest, no truncation to A's 2 years.
    expect(annual.map((p) => p[0]?.value.periodEnd)).toEqual([
      "2021-12-31",
      "2022-12-31",
      "2023-12-31",
      "2024-12-31",
    ]);
    // Overlapping years: higher-priority A wins the value; the two A-only years
    // (indices 2,3) come from A; the two early years come from B.
    expect(annual.map((p) => p[0]?.value.raw)).toEqual([170, 180, 200, 210]);

    // Provenance re-keyed to MERGED indices (2 and 3 for the A-won years).
    expect(provenance[provenanceKey("incomeStatement", "annual", 2, "revenue")]?.source).toBe("edgar");
    expect(provenance[provenanceKey("incomeStatement", "annual", 0, "revenue")]?.source).toBe("fmp");
  });

  it("merges fields within the same period from different sources", () => {
    const a = incomeFragment("edgar", 1, [
      [line("revenue", "Revenue", 200, "2024-12-31"), line("netIncome", "Net income", null, "2024-12-31")],
    ]);
    const b = incomeFragment("fmp", 2, [
      [line("revenue", "Revenue", 999, "2024-12-31"), line("netIncome", "Net income", 50, "2024-12-31")],
    ]);

    const { financials, provenance } = mergeFinancials([a, b]);
    const period = financials.incomeStatement.annual[0] ?? [];
    const byTag = Object.fromEntries(period.map((i) => [i.tag, i.value.raw]));

    expect(byTag.revenue).toBe(200); // A wins revenue
    expect(byTag.netIncome).toBe(50); // A had null -> B fills it
    expect(provenance[provenanceKey("incomeStatement", "annual", 0, "revenue")]?.source).toBe("edgar");
    expect(provenance[provenanceKey("incomeStatement", "annual", 0, "netIncome")]?.source).toBe("fmp");
  });

  it("keeps a null placeholder for a tag every source left unfilled", () => {
    const a = incomeFragment("edgar", 1, [
      [line("revenue", "Revenue", 200, "2024-12-31"), line("ebit", "EBIT", null, "2024-12-31")],
    ]);
    const { financials, provenance } = mergeFinancials([a]);
    const period = financials.incomeStatement.annual[0] ?? [];
    const ebit = period.find((i) => i.tag === "ebit");

    expect(ebit).toBeDefined();
    expect(ebit?.value.raw).toBeNull();
    // No provenance for an unfilled field.
    expect(provenance[provenanceKey("incomeStatement", "annual", 0, "ebit")]).toBeUndefined();
  });

  it("preserves untagged line items, deduped by label (first source wins)", () => {
    const a = incomeFragment("edgar", 1, [
      [line(null, "Restructuring charge", 5, "2024-12-31")],
    ]);
    const b = incomeFragment("fmp", 2, [
      [line(null, "restructuring  charge", 7, "2024-12-31"), line(null, "SGX levy", 1, "2024-12-31")],
    ]);
    const { financials } = mergeFinancials([a, b]);
    const period = financials.incomeStatement.annual[0] ?? [];
    const untagged = period.filter((i) => i.tag === null);

    // "Restructuring charge" deduped to A's; "SGX levy" preserved from B.
    expect(untagged.map((i) => i.label)).toEqual(["Restructuring charge", "SGX levy"]);
    expect(untagged[0]?.value.raw).toBe(5);
  });

  it("is deterministic regardless of source period ordering", () => {
    const a = incomeFragment("edgar", 1, [
      [line("revenue", "Revenue", 210, "2024-12-31")],
      [line("revenue", "Revenue", 200, "2023-12-31")], // out of order on purpose
    ]);
    const { financials } = mergeFinancials([a]);
    expect(financials.incomeStatement.annual.map((p) => p[0]?.value.periodEnd)).toEqual([
      "2023-12-31",
      "2024-12-31",
    ]);
  });

  it("merges the LTM period at index 0", () => {
    const a = createEmptyAdapterFragment();
    const ltm: CanonicalStatementPeriod = [line("revenue", "Revenue", 300, "2025-06-30")];
    a.financials = { incomeStatement: { annual: [], quarterly: [], ltm } };
    const freq: PeriodFrequency = "ltm";
    a.provenance.financials[provenanceKey("incomeStatement", freq, 0, "revenue")] = record("fmp", 2, "2025-06-30");

    const { financials, provenance } = mergeFinancials([a]);
    expect(financials.incomeStatement.ltm?.[0]?.value.raw).toBe(300);
    expect(provenance[provenanceKey("incomeStatement", "ltm", 0, "revenue")]?.source).toBe("fmp");
  });

  it("returns fully-empty statements when no fragment supplies financials", () => {
    const { financials, provenance } = mergeFinancials([createEmptyAdapterFragment()]);
    expect(financials.incomeStatement).toEqual({ annual: [], quarterly: [], ltm: null });
    expect(financials.balanceSheet).toEqual({ annual: [], quarterly: [], ltm: null });
    expect(financials.cashFlow).toEqual({ annual: [], quarterly: [], ltm: null });
    expect(provenance).toEqual({});
  });
});
