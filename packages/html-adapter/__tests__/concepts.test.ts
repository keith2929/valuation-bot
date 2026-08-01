import { describe, expect, it } from "vitest";

import { matchHtmlConceptTag } from "../src/concepts";

describe("matchHtmlConceptTag", () => {
  it("matches an exact known caption", () => {
    expect(matchHtmlConceptTag("Revenue", "incomeStatement")?.tag).toBe("revenue");
    expect(matchHtmlConceptTag("Total Assets", "balanceSheet")?.tag).toBe("totalAssets");
    expect(matchHtmlConceptTag("Operating Cash Flow", "cashFlow")?.tag).toBe("netCashFromOperating");
  });

  it("is case-insensitive and tolerant of footnote markers", () => {
    expect(matchHtmlConceptTag("net income", "incomeStatement")?.tag).toBe("netIncome");
    expect(matchHtmlConceptTag("Net Income (1)", "incomeStatement")?.tag).toBe("netIncome");
  });

  it("matches HTML-entity-decoded ampersand captions", () => {
    expect(matchHtmlConceptTag("Cash & Equivalents", "balanceSheet")?.tag).toBe("cashAndCashEquivalents");
  });

  it("prefers the longer/more specific pattern over a shorter contained one", () => {
    expect(matchHtmlConceptTag("Total Operating Expenses", "incomeStatement")?.tag).toBe("operatingExpenses");
  });

  it("returns null for an unrecognized label", () => {
    expect(matchHtmlConceptTag("Some Vendor-Specific Metric", "incomeStatement")).toBeNull();
    expect(matchHtmlConceptTag("", "incomeStatement")).toBeNull();
  });

  it("does not cross-match labels between statement kinds", () => {
    expect(matchHtmlConceptTag("Total Assets", "incomeStatement")).toBeNull();
  });
});
