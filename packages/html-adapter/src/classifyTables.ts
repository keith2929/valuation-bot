/**
 * Matches a page's `ParsedTable[]` to the three core statement kinds. Titles
 * get renamed across publishers ("P&L" vs "Income Statement") and are
 * sometimes absent entirely (no heading, no `<caption>`), so title matching
 * alone isn't robust enough - this also scores each table against the row
 * labels a real statement of that kind would contain, and picks whichever
 * signal (or combination) scores highest.
 */
import type { HtmlStatementKind } from "./config";
import type { HtmlFinancialTables, ParsedTable } from "./types";

const TITLE_KEYWORDS: Record<HtmlStatementKind, string[]> = {
  incomeStatement: ["income statement", "statement of income", "statement of operations", "profit and loss", "p&l", "p & l"],
  balanceSheet: ["balance sheet", "statement of financial position"],
  cashFlow: ["cash flow", "statement of cash flows"],
};

/** Row-label signatures a real statement of this kind would contain, used when the title is missing/renamed/ambiguous. */
const ROW_SIGNATURE_KEYWORDS: Record<HtmlStatementKind, string[]> = {
  incomeStatement: ["revenue", "total revenue", "net income", "gross profit", "operating income", "cost of revenue"],
  balanceSheet: ["total assets", "total liabilities", "total equity", "shareholders equity", "cash and equivalents", "shareholders' equity"],
  cashFlow: ["operating cash flow", "cash from operations", "free cash flow", "capital expenditures", "financing activities", "investing activities"],
};

const TITLE_MATCH_SCORE = 10;
const ROW_SIGNATURE_MATCH_SCORE = 1;
/** Minimum score for a table to count as a confident match; below this it's treated as "not found" rather than guessed. */
const MIN_CONFIDENT_SCORE = 1;

function scoreTable(table: ParsedTable, kind: HtmlStatementKind): number {
  let score = 0;

  const title = table.title?.toLowerCase() ?? null;
  if (title && TITLE_KEYWORDS[kind].some((keyword) => title.includes(keyword))) {
    score += TITLE_MATCH_SCORE;
  }

  const labels = table.rows.map((row) => row.label.toLowerCase());
  for (const keyword of ROW_SIGNATURE_KEYWORDS[kind]) {
    if (labels.some((label) => label.includes(keyword))) {
      score += ROW_SIGNATURE_MATCH_SCORE;
    }
  }

  return score;
}

/**
 * Assigns each statement kind the highest-scoring, not-yet-assigned table
 * (ties keep the earliest/first table in page order). A kind with no table
 * scoring above the confidence floor gets `null` plus a note - an absent or
 * unrecognizable table is a normal, non-fatal outcome, not an error to throw.
 */
export function classifyFinancialTables(tables: ParsedTable[]): { tables: HtmlFinancialTables; notes: string[] } {
  const notes: string[] = [];
  const assigned = new Set<number>();
  const kinds: HtmlStatementKind[] = ["incomeStatement", "balanceSheet", "cashFlow"];
  const result: HtmlFinancialTables = { incomeStatement: null, balanceSheet: null, cashFlow: null };

  for (const kind of kinds) {
    let bestIndex = -1;
    let bestScore = 0;

    tables.forEach((table, index) => {
      if (assigned.has(index)) return;
      const score = scoreTable(table, kind);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= MIN_CONFIDENT_SCORE) {
      const table = tables[bestIndex];
      if (table) {
        result[kind] = table;
        assigned.add(bestIndex);
        continue;
      }
    }

    notes.push(`${kind} table not found or unrecognized on page`);
  }

  return { tables: result, notes };
}
