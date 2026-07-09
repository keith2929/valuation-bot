/**
 * Statement heading phrases (matched case-insensitively) that mark a report
 * page as belonging to one of the three financial statements. Per
 * masterprompt2.md Part 1: locate these pages first and send only those to
 * the LLM, instead of the whole report.
 */
export const STATEMENT_MARKERS = [
  "Statement of Financial Position",
  "Profit or Loss",
  "Cash Flows",
] as const;

export type StatementMarker = (typeof STATEMENT_MARKERS)[number];

export interface StatementPageMatch {
  /** Index of this page in the `pages` array passed to `findStatementPages`. */
  index: number;
  /** Markers found on this page, in `STATEMENT_MARKERS` order. */
  markers: StatementMarker[];
}

/**
 * Scans per-page extracted report text and returns, for each page that
 * contains at least one statement heading, its index and which heading(s)
 * matched. Matching is case-insensitive and looks for the heading anywhere
 * in the page text.
 *
 * Throws RangeError if `pages` is empty.
 */
export function findStatementPages(pages: readonly string[]): StatementPageMatch[] {
  if (pages.length === 0) {
    throw new RangeError("pages must contain at least one page");
  }

  const matches: StatementPageMatch[] = [];
  for (const [index, page] of pages.entries()) {
    const lower = page.toLowerCase();
    const markers = STATEMENT_MARKERS.filter((marker) => lower.includes(marker.toLowerCase()));
    if (markers.length > 0) {
      matches.push({ index, markers });
    }
  }
  return matches;
}

/**
 * Convenience wrapper over `findStatementPages` that returns just the
 * matching page indices in ascending order — the shape callers need to
 * slice the original `pages` array before sending it to the LLM.
 *
 * Throws RangeError if `pages` is empty.
 */
export function findStatementPageIndices(pages: readonly string[]): number[] {
  return findStatementPages(pages).map((match) => match.index);
}
