import { describe, expect, it } from "vitest";

import { provenanceKey } from "@valuation-bot/canonical";

import { buildStatement, toIsoDateTime } from "../src/statements";
import { BALANCE_SHEET_ANNUAL, BALANCE_SHEET_QUARTERLY } from "./fixtures/balanceSheet";
import { CASH_FLOW_ANNUAL, CASH_FLOW_QUARTERLY } from "./fixtures/cashFlow";
import { INCOME_STATEMENT_ANNUAL, INCOME_STATEMENT_QUARTERLY } from "./fixtures/incomeStatement";

const options = { maxAnnualPeriods: 10, maxQuarterlyPeriods: 8 };

function findItem(period: { tag: string | null }[], tag: string) {
  return period.find((item) => item.tag === tag);
}

describe("toIsoDateTime", () => {
  it("converts a bare date to midnight UTC", () => {
    expect(toIsoDateTime("2023-09-30")).toBe("2023-09-30T00:00:00Z");
  });

  it("converts an FMP space-separated timestamp to a zoned ISO string", () => {
    expect(toIsoDateTime("2023-11-02 18:08:27")).toBe("2023-11-02T18:08:27Z");
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
    { annual: INCOME_STATEMENT_ANNUAL, quarterly: INCOME_STATEMENT_QUARTERLY },
    options,
  );

  it("emits annual periods oldest -> newest regardless of FMP's newest-first row order", () => {
    const ends = result.statement.annual.map((period) => findItem(period, "revenue")?.value.periodEnd);
    expect(ends).toEqual(["2021-09-25", "2022-09-24", "2023-09-30"]);
  });

  it("records raw value, ones scale, and reporting currency on each monetary item", () => {
    const fy2023 = result.statement.annual[2] ?? [];
    expect(findItem(fy2023, "netIncome")?.value).toEqual({
      raw: 96995000000,
      units: "ones",
      currency: "USD",
      periodEnd: "2023-09-30",
    });
  });

  it("maps eps/epsdiluted and weighted-average share fields to the shared canonical tags", () => {
    const fy2023 = result.statement.annual[2] ?? [];
    expect(findItem(fy2023, "epsBasic")?.value.raw).toBe(6.16);
    expect(findItem(fy2023, "epsDiluted")?.value.raw).toBe(6.13);
    expect(findItem(fy2023, "weightedAverageSharesDiluted")?.value.raw).toBe(15812547000);
  });

  it("attaches Tier-2 FMP provenance keyed by provenanceKey, with asOf derived from fillingDate", () => {
    const key = provenanceKey("incomeStatement", "annual", 2, "revenue");
    expect(result.provenance[key]).toEqual({
      source: "fmp",
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
    { annual: BALANCE_SHEET_ANNUAL, quarterly: BALANCE_SHEET_QUARTERLY },
    options,
  );

  it("reports a concept absent from every row as missing", () => {
    expect(result.missingTags).toContain("shortTermInvestments");
  });

  it("still normalizes the concepts that are present", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "totalAssets")?.value.raw).toBe(352583000000);
  });
});

describe("buildStatement - cash flow", () => {
  const result = buildStatement("cashFlow", { annual: CASH_FLOW_ANNUAL, quarterly: CASH_FLOW_QUARTERLY }, options);

  it("maps FMP's legacy v3 field names (including the 'Activites' typo) to canonical tags", () => {
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "netCashFromInvesting")?.value.raw).toBe(3705000000);
    expect(findItem(fy2023, "netCashFromFinancing")?.value.raw).toBe(-108488000000);
    expect(findItem(fy2023, "capitalExpenditures")?.value.raw).toBe(-10959000000);
  });
});

describe("buildStatement - period capping", () => {
  it("keeps only the most recent N annual periods, oldest -> newest, when more are supplied", () => {
    const manyRows = Array.from({ length: 12 }, (_, i) => ({
      date: `${2000 + i}-12-31`,
      reportedCurrency: "USD",
      revenue: i,
    }));
    const result = buildStatement("incomeStatement", { annual: manyRows, quarterly: [] }, { maxAnnualPeriods: 5, maxQuarterlyPeriods: 8 });
    expect(result.statement.annual).toHaveLength(5);
    const ends = result.statement.annual.map((period) => findItem(period, "revenue")?.value.periodEnd);
    expect(ends).toEqual(["2007-12-31", "2008-12-31", "2009-12-31", "2010-12-31", "2011-12-31"]);
  });
});
