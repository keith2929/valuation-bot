/**
 * Top-level Tier 4 HTML fetch + parse pipeline: for each of the three
 * statement pages, fetch the HTML, parse whatever tables it contains, and
 * classify them by statement kind - producing intermediate `ParsedTable` rows,
 * never canonical line items. Canonical tag mapping (turning a row's label +
 * column periods into `CanonicalLineItem`s) is a later stage, once this
 * layer's output shape has proven itself against real pages.
 *
 * True to the shared adapter contract, this never throws: a page that 404s,
 * times out, or has no recognizable tables just yields `null` for that
 * statement plus a `CanonicalError` note - never a rejected promise. Only a
 * 429 (rate limiting) short-circuits the whole call, since it signals "this
 * source has nothing more to give right now" rather than "this ticker/page
 * has no data".
 */
import { adapterError } from "@valuation-bot/source-adapter";
import type { RateLimited } from "@valuation-bot/source-adapter";
import type { CanonicalError } from "@valuation-bot/canonical";

import { classifyFinancialTables } from "./classifyTables";
import { HTML_SOURCE, resolveHtmlConfig } from "./config";
import type { HtmlConfig, HtmlStatementKind } from "./config";
import { fetchStatementPage, isHtmlPageOk } from "./fetchPage";
import { parseHtmlTables } from "./htmlTables";
import type { HtmlFinancialTables } from "./types";

export interface HtmlFinancialTablesResult {
  tables: HtmlFinancialTables;
  errors: CanonicalError[];
}

export type FetchAndParseFinancialsResult = HtmlFinancialTablesResult | RateLimited;

const STATEMENT_KINDS: HtmlStatementKind[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/**
 * Fetches and parses `ticker`'s three statement pages. Each page is
 * independent - one failing doesn't stop the others - except a rate-limit
 * response, which stops the whole call immediately and bubbles up as the
 * shared `RateLimited` sentinel (mirroring every other `SourceAdapter`).
 */
export async function fetchAndParseFinancials(
  ticker: string,
  config: HtmlConfig = {},
): Promise<FetchAndParseFinancialsResult> {
  const resolved = resolveHtmlConfig(config);
  const errors: CanonicalError[] = [];
  const tablesByKind: Partial<Record<HtmlStatementKind, ReturnType<typeof parseHtmlTables>["tables"]>> = {};

  for (const kind of STATEMENT_KINDS) {
    const page = await fetchStatementPage(ticker, kind, resolved);

    if ("rateLimited" in page) {
      return page;
    }

    if (!isHtmlPageOk(page)) {
      errors.push(adapterError(HTML_SOURCE, `failed to fetch ${kind} page: ${page.message}`, { field: kind }));
      tablesByKind[kind] = [];
      continue;
    }

    const parsed = parseHtmlTables(page.html);
    for (const note of parsed.notes) {
      errors.push(adapterError(HTML_SOURCE, note, { field: kind }));
    }
    tablesByKind[kind] = parsed.tables;
  }

  const merged = mergeClassifiedTables(tablesByKind, errors);
  return { tables: merged, errors };
}

/**
 * Each fetched page is classified independently (a page can carry more than
 * one table, e.g. an annual + quarterly variant) and only the table matching
 * that page's own expected statement kind is kept - this avoids a page's
 * unrelated/supplementary tables leaking into the result.
 */
function mergeClassifiedTables(
  tablesByKind: Partial<Record<HtmlStatementKind, ReturnType<typeof parseHtmlTables>["tables"]>>,
  errors: CanonicalError[],
): HtmlFinancialTables {
  const result: HtmlFinancialTables = { incomeStatement: null, balanceSheet: null, cashFlow: null };

  for (const kind of STATEMENT_KINDS) {
    const tables = tablesByKind[kind] ?? [];
    const classified = classifyFinancialTables(tables);
    result[kind] = classified.tables[kind];
    if (!result[kind]) {
      errors.push(adapterError(HTML_SOURCE, `${kind} table not found or unrecognized on its page`, { field: kind }));
    }
  }

  return result;
}
