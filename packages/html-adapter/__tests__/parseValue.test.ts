import { describe, expect, it } from "vitest";

import { parseHtmlNumericCell } from "../src/parseValue";

describe("parseHtmlNumericCell", () => {
  it("parses a plain integer with thousands separators", () => {
    expect(parseHtmlNumericCell("394,328")).toBe(394328);
  });

  it("parses a decimal", () => {
    expect(parseHtmlNumericCell("1,234.56")).toBeCloseTo(1234.56);
  });

  it("treats parenthesized numbers as negative", () => {
    expect(parseHtmlNumericCell("(10,708)")).toBe(-10708);
  });

  it("treats a leading minus sign as negative", () => {
    expect(parseHtmlNumericCell("-10,708")).toBe(-10708);
  });

  it("strips currency symbols", () => {
    expect(parseHtmlNumericCell("$1,234")).toBe(1234);
  });

  it("applies magnitude suffixes", () => {
    expect(parseHtmlNumericCell("1.2B")).toBeCloseTo(1.2e9);
    expect(parseHtmlNumericCell("500M")).toBe(5e8);
    expect(parseHtmlNumericCell("3K")).toBe(3000);
  });

  it("returns null for blank/dash/N-A cells", () => {
    expect(parseHtmlNumericCell("")).toBeNull();
    expect(parseHtmlNumericCell("-")).toBeNull();
    expect(parseHtmlNumericCell("—")).toBeNull();
    expect(parseHtmlNumericCell("N/A")).toBeNull();
    expect(parseHtmlNumericCell("n/a")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseHtmlNumericCell("Revenue")).toBeNull();
  });
});
