import { describe, expect, it } from "vitest";

import { provenanceKey } from "@valuation-bot/canonical";

import {
  buildStatement,
  deriveFiscalYearEnd,
  deriveReportingCurrency,
  deriveSharesOutstanding,
} from "../src/companyFacts";
import { COMPANY_FACTS_FIXTURE } from "./fixtures/companyFacts";

const gaap = COMPANY_FACTS_FIXTURE.facts?.["us-gaap"] ?? {};
const dei = COMPANY_FACTS_FIXTURE.facts?.dei ?? {};
const options = { maxAnnualPeriods: 10, maxQuarterlyPeriods: 8 };

function findItem(period: { tag: string | null }[], tag: string) {
  return period.find((item) => item.tag === tag);
}

describe("buildStatement - income statement", () => {
  const result = buildStatement("incomeStatement", gaap, options);

  it("emits annual periods oldest -> newest across the union of concept period-ends", () => {
    const ends = result.statement.annual.map((period) => {
      const revenue = findItem(period, "revenue");
      return revenue?.value.periodEnd;
    });
    expect(result.statement.annual).toHaveLength(3);
    expect(ends).toEqual(["2021-09-25", "2022-09-24", "2023-09-30"]);
  });

  it("prefers the most-recently-filed value for a restated period", () => {
    const fy2022 = result.statement.annual[1];
    const revenue = findItem(fy2022 ?? [], "revenue");
    // Original filing was 394328000000; the later comparative restated it to 394330000000.
    expect(revenue?.value.raw).toBe(394330000000);
  });

  it("records raw value, ones scale, and reporting currency on each monetary item", () => {
    const fy2023 = result.statement.annual[2] ?? [];
    const netIncome = findItem(fy2023, "netIncome");
    expect(netIncome?.value).toEqual({
      raw: 96995000000,
      units: "ones",
      currency: "USD",
      periodEnd: "2023-09-30",
    });
  });

  it("treats per-share concepts as USD with no share-count currency, and share counts as unitless", () => {
    const fy2023 = result.statement.annual[2] ?? [];
    expect(findItem(fy2023, "epsDiluted")?.value).toMatchObject({ raw: 6.13, units: "ones", currency: "USD" });
    expect(findItem(fy2023, "weightedAverageSharesDiluted")?.value).toMatchObject({
      raw: 15812547000,
      units: "ones",
      currency: null,
    });
  });

  it("keeps only single-quarter durations, excluding the YTD figure sharing the same period-end", () => {
    expect(result.statement.quarterly).toHaveLength(1);
    const q2 = result.statement.quarterly[0] ?? [];
    expect(findItem(q2, "revenue")?.value.raw).toBe(94836000000);
  });

  it("attaches Tier-1 EDGAR provenance keyed by provenanceKey, with rawUnits and periodEnd", () => {
    const key = provenanceKey("incomeStatement", "annual", 2, "revenue");
    expect(result.provenance[key]).toEqual({
      source: "edgar",
      tier: 1,
      asOf: "2023-11-03T00:00:00Z",
      periodEnd: "2023-09-30",
      rawUnits: "USD",
      confidence: 0.98,
    });
    const epsKey = provenanceKey("incomeStatement", "annual", 2, "epsDiluted");
    expect(result.provenance[epsKey]?.rawUnits).toBe("USD/shares");
  });
});

describe("buildStatement - balance sheet (instants)", () => {
  const result = buildStatement("balanceSheet", gaap, options);

  it("reads balance-sheet instants into annual periods", () => {
    expect(result.statement.annual).toHaveLength(2);
    const fy2023 = result.statement.annual[1] ?? [];
    expect(findItem(fy2023, "totalAssets")?.value.raw).toBe(352583000000);
    expect(findItem(fy2023, "totalEquity")?.value.raw).toBe(62146000000);
  });

  it("reports concepts absent from the payload as missing rather than fabricating them", () => {
    expect(result.statement.annual).not.toHaveLength(0);
    expect(result.missingTags).toContain("goodwill");
  });

  it("routes a 10-Q instant into the quarterly series", () => {
    expect(result.statement.quarterly).toHaveLength(1);
    const q2 = result.statement.quarterly[0] ?? [];
    expect(findItem(q2, "totalAssets")?.value.raw).toBe(332160000000);
  });
});

describe("buildStatement - cash flow", () => {
  it("normalizes operating cash flow and capex durations", () => {
    const result = buildStatement("cashFlow", gaap, options);
    const fy2023 = result.statement.annual.at(-1) ?? [];
    expect(findItem(fy2023, "netCashFromOperating")?.value.raw).toBe(110543000000);
    expect(findItem(fy2023, "capitalExpenditures")?.value.raw).toBe(10959000000);
  });
});

describe("period limits", () => {
  it("keeps only the most-recent N annual periods", () => {
    const result = buildStatement("incomeStatement", gaap, { maxAnnualPeriods: 2, maxQuarterlyPeriods: 8 });
    const ends = result.statement.annual.map((period) => findItem(period, "revenue")?.value.periodEnd ?? null);
    // Drops the oldest (2021-09-25), keeps the two newest.
    expect(result.statement.annual).toHaveLength(2);
    expect(ends).toEqual(["2022-09-24", "2023-09-30"]);
  });
});

describe("meta derivations", () => {
  it("infers the reporting currency", () => {
    expect(deriveReportingCurrency(gaap)).toBe("USD");
  });

  it("takes the latest 10-K balance-sheet date as fiscal year-end", () => {
    expect(deriveFiscalYearEnd(gaap)).toEqual({ end: "2023-09-30", filed: "2023-11-03" });
  });

  it("takes the most recent dei shares-outstanding figure", () => {
    expect(deriveSharesOutstanding(dei)).toEqual({
      val: 15634232000,
      end: "2023-10-20",
      filed: "2023-11-03",
      rawUnitKey: "shares",
    });
  });
});
