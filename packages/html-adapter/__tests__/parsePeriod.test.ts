import { describe, expect, it } from "vitest";

import { parseHtmlPeriodHeader } from "../src/parsePeriod";

describe("parseHtmlPeriodHeader", () => {
  it("parses an ISO date", () => {
    expect(parseHtmlPeriodHeader("2023-12-31")).toBe("2023-12-31");
  });

  it("parses a month/day/year caption", () => {
    expect(parseHtmlPeriodHeader("Dec 31, 2023")).toBe("2023-12-31");
    expect(parseHtmlPeriodHeader("September 30 2024")).toBe("2024-09-30");
  });

  it("parses an 'FY 2023' style header to a calendar year end", () => {
    expect(parseHtmlPeriodHeader("FY 2023")).toBe("2023-12-31");
    expect(parseHtmlPeriodHeader("FY2023")).toBe("2023-12-31");
  });

  it("parses a bare 4-digit year to a calendar year end", () => {
    expect(parseHtmlPeriodHeader("2023")).toBe("2023-12-31");
  });

  it("parses a quarter header to its quarter end", () => {
    expect(parseHtmlPeriodHeader("Q1 2024")).toBe("2024-03-31");
    expect(parseHtmlPeriodHeader("Q3 2024")).toBe("2024-09-30");
  });

  it("returns null for unrecognized headers", () => {
    expect(parseHtmlPeriodHeader("TTM")).toBeNull();
    expect(parseHtmlPeriodHeader("")).toBeNull();
    expect(parseHtmlPeriodHeader("Current")).toBeNull();
  });
});
