import { describe, expect, it } from "vitest";

import { classifyFinancialTables } from "../src/classifyTables";
import { parseHtmlTables } from "../src/htmlTables";
import {
  CASH_FLOW_PAGE_RENAMED_TITLE,
  INCOME_STATEMENT_PAGE,
  PAGE_WITH_MULTIPLE_TABLES,
  PAGE_WITH_NO_TABLES,
} from "./fixtures/pages";
import type { ParsedTable } from "../src/types";

function tablesFrom(html: string): ParsedTable[] {
  return parseHtmlTables(html).tables;
}

describe("classifyFinancialTables", () => {
  it("matches a table by its title", () => {
    const { tables, notes } = classifyFinancialTables(tablesFrom(INCOME_STATEMENT_PAGE));
    expect(tables.incomeStatement?.rows[0]).toEqual({ label: "Revenue", values: ["394,328", "383,285"] });
    expect(tables.balanceSheet).toBeNull();
    expect(tables.cashFlow).toBeNull();
    expect(notes).toContain("balanceSheet table not found or unrecognized on page");
    expect(notes).toContain("cashFlow table not found or unrecognized on page");
  });

  it("falls back to row-label signatures when the title doesn't match any known caption", () => {
    const { tables, notes } = classifyFinancialTables(tablesFrom(CASH_FLOW_PAGE_RENAMED_TITLE));
    expect(tables.cashFlow?.title).toBe("Money Movements");
    expect(tables.cashFlow?.rows.map((row) => row.label)).toContain("Operating Cash Flow");
    expect(notes).toContain("incomeStatement table not found or unrecognized on page");
  });

  it("ignores an unrelated table (e.g. Key Statistics) and picks the real income statement table", () => {
    const { tables } = classifyFinancialTables(tablesFrom(PAGE_WITH_MULTIPLE_TABLES));
    expect(tables.incomeStatement?.title).toBe("Income Statement");
  });

  it("returns all-null with three notes when there are no tables at all", () => {
    const { tables, notes } = classifyFinancialTables(tablesFrom(PAGE_WITH_NO_TABLES));
    expect(tables).toEqual({ incomeStatement: null, balanceSheet: null, cashFlow: null });
    expect(notes).toHaveLength(3);
  });

  it("never assigns the same table to two different statement kinds", () => {
    const { tables } = classifyFinancialTables(tablesFrom(INCOME_STATEMENT_PAGE));
    const assignedTables = [tables.incomeStatement, tables.balanceSheet, tables.cashFlow].filter(Boolean);
    expect(new Set(assignedTables).size).toBe(assignedTables.length);
  });
});
