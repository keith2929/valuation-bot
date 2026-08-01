/**
 * Intermediate, pre-canonical row structures the HTML parser produces. These
 * deliberately stop short of canonical tags/values - a later stage maps a
 * `ParsedTable`'s rows to `CanonicalLineItem`s once it knows the statement
 * kind and column periods. Keeping this layer untyped-by-tag is what lets the
 * parser stay robust to renamed captions and reordered/missing columns: it
 * only records what the page actually printed.
 */

/** One row of a parsed HTML table: the leading label cell plus the remaining value cells, in column order. */
export interface ParsedTableRow {
  /** The row's leading caption cell, e.g. "Revenue", "Total Assets". Empty string if the row had no cells at all. */
  label: string;
  /** Remaining cells in the row, left-to-right, exactly as printed (not yet parsed as numbers). Ragged rows keep whatever cells they had - never padded or truncated to match the header. */
  values: string[];
}

/**
 * One `<table>` extracted from the page, plus whatever caption/heading text
 * the parser could associate with it. `headers` is the column header row
 * (e.g. fiscal years or quarters); it is an empty array if the table had no
 * detectable header row - callers must not assume `headers.length` lines up
 * with every row's `values.length`.
 */
export interface ParsedTable {
  /** Nearest heading/caption text found for this table, or null if none could be located. */
  title: string | null;
  headers: string[];
  rows: ParsedTableRow[];
}

/** Result of parsing raw HTML into whatever tables it contains, before any statement classification. */
export interface HtmlParseResult {
  tables: ParsedTable[];
  /** Non-fatal parse notes, e.g. "no <table> elements found". Parsing never throws - problems are recorded here instead. */
  notes: string[];
}

/**
 * The three core statement tables, located within a page's `ParsedTable[]`
 * by title/content signature. Each is null when the page doesn't have (or
 * the parser couldn't confidently identify) that statement - a page missing
 * or renaming a table degrades to `null` for that field, never a thrown error.
 */
export interface HtmlFinancialTables {
  incomeStatement: ParsedTable | null;
  balanceSheet: ParsedTable | null;
  cashFlow: ParsedTable | null;
}
