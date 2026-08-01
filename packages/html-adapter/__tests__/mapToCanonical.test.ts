import { createEmptyCanonicalFinancialData } from "@valuation-bot/canonical";
import type { CanonicalFinancials } from "@valuation-bot/canonical";
import { describe, expect, it } from "vitest";

import { HTML_CONFIDENCE, HTML_SOURCE, HTML_TIER } from "../src/config";
import { mapHtmlTablesToCanonicalFinancials } from "../src/mapToCanonical";
import type { HtmlFinancialTables, ParsedTable } from "../src/types";

const INCOME_TABLE: ParsedTable = {
  title: "Income Statement",
  headers: ["FY 2022", "FY 2023"],
  rows: [
    { label: "Revenue", values: ["394,328", "383,285"] },
    { label: "Cost of Revenue", values: ["223,546", "214,137"] },
    { label: "Net Income", values: ["99,803", "96,995"] },
    { label: "Some Vendor-Specific Adjustment", values: ["1,000", "2,000"] },
  ],
};

const BALANCE_TABLE: ParsedTable = {
  title: "Balance Sheet",
  headers: ["FY 2022", "FY 2023"],
  rows: [
    { label: "Cash & Equivalents", values: ["23,646", "29,965"] },
    { label: "Total Assets", values: ["352,755", "352,583"] },
  ],
};

function emptyFinancials(): CanonicalFinancials {
  return createEmptyCanonicalFinancialData().financials;
}

function tablesWith(overrides: Partial<HtmlFinancialTables>): HtmlFinancialTables {
  return { incomeStatement: null, balanceSheet: null, cashFlow: null, ...overrides };
}

describe("mapHtmlTablesToCanonicalFinancials", () => {
  it("maps recognized rows/columns into canonical line items when nothing is filled yet", () => {
    const { financials, provenance, errors } = mapHtmlTablesToCanonicalFinancials(
      tablesWith({ incomeStatement: INCOME_TABLE }),
      emptyFinancials(),
      { fetchTimestamp: "2026-08-01T00:00:00Z" },
    );

    expect(financials.incomeStatement?.annual).toHaveLength(2);
    const [fy2022, fy2023] = financials.incomeStatement!.annual;
    expect(fy2022).toEqual([
      { tag: "revenue", label: "Revenue", value: { raw: 394328, units: null, currency: null, periodEnd: "2022-12-31" } },
      { tag: "costOfRevenue", label: "Cost of revenue", value: { raw: 223546, units: null, currency: null, periodEnd: "2022-12-31" } },
      { tag: "netIncome", label: "Net income", value: { raw: 99803, units: null, currency: null, periodEnd: "2022-12-31" } },
    ]);
    expect(fy2023.map((item) => item.tag)).toEqual(["revenue", "costOfRevenue", "netIncome"]);

    const provenanceRecord = provenance["incomeStatement.annual.0.revenue"];
    expect(provenanceRecord).toEqual({
      source: HTML_SOURCE,
      tier: HTML_TIER,
      asOf: "2026-08-01T00:00:00Z",
      periodEnd: "2022-12-31",
      rawUnits: null,
      confidence: HTML_CONFIDENCE,
    });

    expect(errors).toHaveLength(2); // balanceSheet, cashFlow both "no parsed table available"
  });

  it("skips an unrecognized row label", () => {
    const { financials } = mapHtmlTablesToCanonicalFinancials(tablesWith({ incomeStatement: INCOME_TABLE }), emptyFinancials());
    const tags = financials.incomeStatement!.annual.flatMap((period) => period.map((item) => item.tag));
    expect(tags).not.toContain(null);
    expect(tags.every((tag) => tag !== null)).toBe(true);
  });

  it("does not re-fill a field tiers 1-3 already resolved for that period", () => {
    const existing = emptyFinancials();
    existing.incomeStatement.annual = [
      [{ tag: "revenue", label: "Revenue", value: { raw: 999999, units: "ones", currency: "USD", periodEnd: "2022-12-31" } }],
    ];

    const { financials, provenance } = mapHtmlTablesToCanonicalFinancials(
      tablesWith({ incomeStatement: INCOME_TABLE }),
      existing,
    );

    const fy2022 = financials.incomeStatement!.annual.find((period) =>
      period.some((item) => item.value.periodEnd === "2022-12-31"),
    );
    expect(fy2022?.some((item) => item.tag === "revenue")).toBe(false);
    expect(fy2022?.some((item) => item.tag === "costOfRevenue")).toBe(true);
    expect(provenance["incomeStatement.annual.0.revenue"]).toBeUndefined();
  });

  it("drops a period entirely once every recognized field in it is already covered", () => {
    const existing = emptyFinancials();
    existing.incomeStatement.annual = [
      [
        { tag: "revenue", label: "Revenue", value: { raw: 1, units: null, currency: null, periodEnd: "2022-12-31" } },
        { tag: "costOfRevenue", label: "Cost of revenue", value: { raw: 1, units: null, currency: null, periodEnd: "2022-12-31" } },
        { tag: "netIncome", label: "Net income", value: { raw: 1, units: null, currency: null, periodEnd: "2022-12-31" } },
      ],
    ];

    const table: ParsedTable = { ...INCOME_TABLE, headers: ["FY 2022"], rows: INCOME_TABLE.rows.map((row) => ({ label: row.label, values: [row.values[0]!] })) };
    const { financials, errors } = mapHtmlTablesToCanonicalFinancials(tablesWith({ incomeStatement: table }), existing);

    expect(financials.incomeStatement).toBeUndefined();
    expect(errors.some((error) => error.message.includes("no fillable incomeStatement fields"))).toBe(true);
  });

  it("skips a column whose header can't be parsed into a period", () => {
    const table: ParsedTable = { ...BALANCE_TABLE, headers: ["TTM", "FY 2023"] };
    const { financials } = mapHtmlTablesToCanonicalFinancials(tablesWith({ balanceSheet: table }), emptyFinancials());
    expect(financials.balanceSheet?.annual).toHaveLength(1);
    expect(financials.balanceSheet?.annual[0]?.[0]?.value.periodEnd).toBe("2023-12-31");
  });

  it("records a note (not a throw) when a statement table is missing entirely", () => {
    const { financials, errors } = mapHtmlTablesToCanonicalFinancials(tablesWith({}), emptyFinancials());
    expect(financials).toEqual({});
    expect(errors).toHaveLength(3);
    for (const error of errors) {
      expect(error.source).toBe(HTML_SOURCE);
    }
  });

  it("never throws on malformed rows (ragged values, blank cells)", () => {
    const raggedTable: ParsedTable = {
      title: "Income Statement",
      headers: ["FY 2022", "FY 2023"],
      rows: [
        { label: "Revenue", values: ["394,328"] }, // missing second column
        { label: "", values: [] },
        { label: "Net Income", values: ["", "N/A"] },
      ],
    };
    expect(() => mapHtmlTablesToCanonicalFinancials(tablesWith({ incomeStatement: raggedTable }), emptyFinancials())).not.toThrow();
  });
});
