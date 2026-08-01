import { describe, expect, it } from "vitest";

import { buildStatement } from "../src/statements";
import type { YahooStatementRow } from "../src/types";

const ANNUAL_ROWS: YahooStatementRow[] = [
  {
    endDate: { raw: 1664496000, fmt: "2022-09-30" },
    totalRevenue: { raw: 350000000000, fmt: "350B" },
    netIncome: { raw: 77000000000, fmt: "77B" },
  },
  {
    endDate: { raw: 1696032000, fmt: "2023-09-30" },
    totalRevenue: { raw: 383285000000, fmt: "383.285B" },
    netIncome: { raw: 96995000000, fmt: "96.995B" },
  },
];

const QUARTERLY_ROWS: YahooStatementRow[] = [
  { endDate: { raw: 1688083200, fmt: "2023-06-30" }, totalRevenue: { raw: 90000000000, fmt: "90B" } },
];

describe("buildStatement", () => {
  it("normalizes rows oldest -> newest with Tier-3 yfinance provenance", () => {
    const { statement, provenance } = buildStatement(
      "incomeStatement",
      { annual: ANNUAL_ROWS, quarterly: QUARTERLY_ROWS },
      { maxAnnualPeriods: 4, maxQuarterlyPeriods: 4, fetchTimestamp: "2024-01-01T00:00:00Z" },
    );

    expect(statement.annual).toHaveLength(2);
    expect(statement.annual[0]?.find((item) => item.tag === "revenue")?.value.raw).toBe(350000000000);
    expect(statement.annual[1]?.find((item) => item.tag === "revenue")?.value.raw).toBe(383285000000);
    expect(statement.quarterly).toHaveLength(1);
    expect(statement.ltm).toBeNull();

    const record = provenance["incomeStatement.annual.1.revenue"];
    expect(record).toMatchObject({ source: "yfinance", tier: 3, periodEnd: "2023-09-30", asOf: "2024-01-01T00:00:00Z" });
  });

  it("caps to the most recent N periods", () => {
    const rows = [ANNUAL_ROWS[0]!, ANNUAL_ROWS[1]!, { endDate: { fmt: "2024-09-30" }, totalRevenue: { raw: 400 } }];
    const { statement } = buildStatement(
      "incomeStatement",
      { annual: rows, quarterly: [] },
      { maxAnnualPeriods: 2, maxQuarterlyPeriods: 4, fetchTimestamp: "2024-01-01T00:00:00Z" },
    );
    expect(statement.annual).toHaveLength(2);
    expect(statement.annual[1]?.find((item) => item.tag === "revenue")?.value.raw).toBe(400);
  });

  it("drops rows with no readable endDate", () => {
    const rows: YahooStatementRow[] = [{ totalRevenue: { raw: 999 } }, ...ANNUAL_ROWS];
    const { statement } = buildStatement(
      "incomeStatement",
      { annual: rows, quarterly: [] },
      { maxAnnualPeriods: 4, maxQuarterlyPeriods: 4, fetchTimestamp: "2024-01-01T00:00:00Z" },
    );
    expect(statement.annual).toHaveLength(2);
  });

  it("reports canonical tags absent from every row as missingTags", () => {
    const { missingTags } = buildStatement(
      "incomeStatement",
      { annual: ANNUAL_ROWS, quarterly: [] },
      { maxAnnualPeriods: 4, maxQuarterlyPeriods: 4, fetchTimestamp: "2024-01-01T00:00:00Z" },
    );
    expect(missingTags).toContain("grossProfit");
    expect(missingTags).not.toContain("revenue");
  });

  it("leaves value.currency null (Yahoo statement rows carry no currency field)", () => {
    const { statement } = buildStatement(
      "incomeStatement",
      { annual: ANNUAL_ROWS, quarterly: [] },
      { maxAnnualPeriods: 4, maxQuarterlyPeriods: 4, fetchTimestamp: "2024-01-01T00:00:00Z" },
    );
    expect(statement.annual[0]?.find((item) => item.tag === "revenue")?.value.currency).toBeNull();
  });
});
