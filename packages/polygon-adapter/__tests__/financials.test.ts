import { describe, expect, it } from "vitest";

import { provenanceKey } from "@valuation-bot/canonical";

import { buildStatement, toIsoDateTime } from "../src/financials";
import { FINANCIALS_ANNUAL, FINANCIALS_QUARTERLY } from "./fixtures/financials";

const options = { maxAnnualPeriods: 10, maxQuarterlyPeriods: 8 };

function findItem(period: { tag: string | null }[], tag: string) {
  return period.find((item) => item.tag === tag);
}

describe("toIsoDateTime", () => {
  it("converts a bare date to midnight UTC", () => {
    expect(toIsoDateTime("2023-09-30")).toBe("2023-09-30T00:00:00Z");
  });

  it("returns null for null/undefined/empty input", () => {
    expect(toIsoDateTime(null)).toBeNull();
    expect(toIsoDateTime(undefined)).toBeNull();
    expect(toIsoDateTime("")).toBeNull();
  });
});

describe("buildStatement - income statement", () => {
  const result = buildStatement(
    "incomeStatement",
    { annual: FINANCIALS_ANNUAL, quarterly: FINANCIALS_QUARTERLY },
    options,
  );

  it("emits annual periods oldest -> newest, as sourced from end_date", () => {
    const ends = result.statement.annual.map((period) => findItem(period, "revenue")?.value.periodEnd);
    expect(ends).toEqual(["2022-09-24", "2023-09-30"]);
  });

  it("records raw value, ones scale, and currency parsed from the Polygon 'unit' string", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "netIncome")?.value).toEqual({
      raw: 96995000000,
      units: "ones",
      currency: "USD",
      periodEnd: "2023-09-30",
    });
  });

  it("parses the leading currency code off a per-share unit ('USD / shares') but not off a bare 'shares' count", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "epsBasic")?.value.currency).toBe("USD");
    expect(findItem(fy2023, "weightedAverageSharesBasic")?.value.currency).toBeNull();
  });

  it("maps basic/diluted EPS and weighted-average share fields to the shared canonical tags", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "epsBasic")?.value.raw).toBe(6.16);
    expect(findItem(fy2023, "epsDiluted")?.value.raw).toBe(6.13);
    expect(findItem(fy2023, "weightedAverageSharesBasic")?.value.raw).toBe(15744231000);
  });

  it("attaches Tier-2 Polygon provenance keyed by provenanceKey, with asOf derived from filing_date", () => {
    const key = provenanceKey("incomeStatement", "annual", 1, "revenue");
    expect(result.provenance[key]).toEqual({
      source: "polygon",
      tier: 2,
      asOf: "2023-11-03T00:00:00Z",
      periodEnd: "2023-09-30",
      rawUnits: "ones",
      confidence: 0.85,
    });
  });

  it("emits the single quarterly period supplied", () => {
    expect(result.statement.quarterly).toHaveLength(1);
    expect(findItem(result.statement.quarterly[0] ?? [], "revenue")?.value.raw).toBe(89498000000);
  });

  it("reports no missing tags when every concept appears in at least one row", () => {
    expect(result.missingTags).toEqual([]);
  });
});

describe("buildStatement - balance sheet", () => {
  const result = buildStatement(
    "balanceSheet",
    { annual: FINANCIALS_ANNUAL, quarterly: FINANCIALS_QUARTERLY },
    options,
  );

  it("reports a concept absent from every row as missing (Polygon has no standardized inventory/AP breakdown here)", () => {
    expect(result.missingTags).toContain("inventory");
  });

  it("reports every concept missing for a frequency with no matching rows (quarterly omits balance-sheet fields)", () => {
    expect(result.statement.quarterly).toHaveLength(1);
    expect(result.statement.quarterly[0]).toEqual([]);
  });

  it("still normalizes the concepts that are present", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "totalAssets")?.value.raw).toBe(352583000000);
  });
});

describe("buildStatement - cash flow", () => {
  const result = buildStatement("cashFlow", { annual: FINANCIALS_ANNUAL, quarterly: FINANCIALS_QUARTERLY }, options);

  it("maps Polygon's standardized cash-flow fields to canonical tags", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "netCashFromOperating")?.value.raw).toBe(110543000000);
    expect(findItem(fy2023, "netCashFromInvesting")?.value.raw).toBe(3705000000);
    expect(findItem(fy2023, "netCashFromFinancing")?.value.raw).toBe(-108488000000);
  });
});

describe("buildStatement - period capping", () => {
  it("keeps only the most recent N annual periods, oldest -> newest, when more are supplied", () => {
    const manyRows = Array.from({ length: 12 }, (_, i) => ({
      end_date: `${2000 + i}-12-31`,
      financials: { income_statement: { revenues: { value: i, unit: "USD" } } },
    }));
    const result = buildStatement("incomeStatement", { annual: manyRows, quarterly: [] }, { maxAnnualPeriods: 5, maxQuarterlyPeriods: 8 });
    expect(result.statement.annual).toHaveLength(5);
    const ends = result.statement.annual.map((period) => findItem(period, "revenue")?.value.periodEnd);
    expect(ends).toEqual(["2007-12-31", "2008-12-31", "2009-12-31", "2010-12-31", "2011-12-31"]);
  });
});
