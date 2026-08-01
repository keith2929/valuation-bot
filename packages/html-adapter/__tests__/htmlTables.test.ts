import { describe, expect, it } from "vitest";

import { parseHtmlTables } from "../src/htmlTables";
import {
  BALANCE_SHEET_PAGE_NO_THEAD,
  CASH_FLOW_PAGE_RENAMED_TITLE,
  INCOME_STATEMENT_PAGE,
  PAGE_WITH_MULTIPLE_TABLES,
  PAGE_WITH_NO_TABLES,
} from "./fixtures/pages";

describe("parseHtmlTables - well-formed thead/tbody table", () => {
  const { tables, notes } = parseHtmlTables(INCOME_STATEMENT_PAGE);

  it("finds exactly one table and picks up the preceding heading as its title, ignoring <script> noise", () => {
    expect(tables).toHaveLength(1);
    expect(tables[0]?.title).toBe("Income Statement");
    expect(notes).toEqual([]);
  });

  it("drops the corner header cell so headers line up with each row's values", () => {
    expect(tables[0]?.headers).toEqual(["FY 2022", "FY 2023"]);
  });

  it("parses every data row with label + values", () => {
    expect(tables[0]?.rows).toEqual([
      { label: "Revenue", values: ["394,328", "383,285"] },
      { label: "Cost of Revenue", values: ["223,546", "214,137"] },
      { label: "Gross Profit", values: ["170,782", "169,148"] },
      { label: "Net Income", values: ["99,803", "96,995"] },
    ]);
  });
});

describe("parseHtmlTables - no <thead>, first row is all <th>, entities + empty spacer row", () => {
  const { tables } = parseHtmlTables(BALANCE_SHEET_PAGE_NO_THEAD);

  it("treats the all-<th> first row as the header and decodes entities in body cells", () => {
    expect(tables[0]?.headers).toEqual(["FY 2022", "FY 2023"]);
    expect(tables[0]?.rows[0]).toEqual({ label: "Cash & Equivalents", values: ["23,646", "29,965"] });
  });

  it("drops the fully-empty spacer row rather than emitting a blank entry", () => {
    const labels = tables[0]?.rows.map((row) => row.label);
    expect(labels).toEqual(["Cash & Equivalents", "Total Assets", "Total Liabilities"]);
  });
});

describe("parseHtmlTables - renamed table with no <caption>", () => {
  it("still records whatever heading text precedes the table, even if it doesn't match a known statement name", () => {
    const { tables } = parseHtmlTables(CASH_FLOW_PAGE_RENAMED_TITLE);
    expect(tables[0]?.title).toBe("Money Movements");
    expect(tables[0]?.rows.map((row) => row.label)).toEqual([
      "Operating Cash Flow",
      "Capital Expenditures",
      "Free Cash Flow",
    ]);
  });
});

describe("parseHtmlTables - no tables on the page", () => {
  it("returns an empty tables array and a note, never throws", () => {
    const { tables, notes } = parseHtmlTables(PAGE_WITH_NO_TABLES);
    expect(tables).toEqual([]);
    expect(notes).toEqual(["no <table> elements found in page"]);
  });
});

describe("parseHtmlTables - multiple tables on one page", () => {
  it("parses both tables in document order with their own nearest headings", () => {
    const { tables } = parseHtmlTables(PAGE_WITH_MULTIPLE_TABLES);
    expect(tables).toHaveLength(2);
    expect(tables[0]?.title).toBe("Key Statistics");
    expect(tables[1]?.title).toBe("Income Statement");
  });
});

describe("parseHtmlTables - malformed/garbage input", () => {
  it("never throws on empty string or unrelated HTML", () => {
    expect(() => parseHtmlTables("")).not.toThrow();
    expect(() => parseHtmlTables("<html><body>plain text, no tags of interest</body></html>")).not.toThrow();
    expect(parseHtmlTables("").tables).toEqual([]);
  });

  it("never throws on a table with an unclosed tag inside a cell", () => {
    const html = "<table><tr><td>Revenue<td>100</td></tr></table>";
    expect(() => parseHtmlTables(html)).not.toThrow();
  });
});
