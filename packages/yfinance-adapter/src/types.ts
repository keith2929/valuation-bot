/**
 * Raw shapes of Yahoo Finance's unofficial `quoteSummary` JSON response -
 * exactly as the endpoint returns them, before any canonical normalization.
 * Kept separate from `concepts.ts`/`statements.ts`/`meta.ts` (which do the
 * normalizing) so the "what Yahoo sends" and "how we interpret it" concerns
 * stay independent and each row type here can be read directly off a
 * captured fixture.
 */

/**
 * Yahoo wraps most numeric fields in `{ raw, fmt }` (a formatted string
 * alongside the raw number); some responses (e.g. with `formatted=false`)
 * return a bare number instead. Both forms are handled by `readYahooNumber`.
 */
export type YahooNumeric = { raw?: unknown; fmt?: unknown } | number | string | null | undefined;

/** One row of `incomeStatementHistory(Quarterly)`, `balanceSheetHistory(Quarterly)`, or `cashflowStatementHistory(Quarterly)`. */
export interface YahooStatementRow {
  endDate?: YahooNumeric;
  [field: string]: unknown;
}

export interface YahooStatementHistoryModule {
  incomeStatementHistory?: YahooStatementRow[];
  balanceSheetStatements?: YahooStatementRow[];
  cashflowStatements?: YahooStatementRow[];
}

export interface YahooPriceModule {
  symbol?: string;
  longName?: string;
  shortName?: string;
  currency?: string;
  exchangeName?: string;
  regularMarketPrice?: YahooNumeric;
  regularMarketTime?: YahooNumeric;
  [field: string]: unknown;
}

export interface YahooDefaultKeyStatisticsModule {
  sharesOutstanding?: YahooNumeric;
  [field: string]: unknown;
}

/** One element of `quoteSummary.result` - the modules actually requested (see `QUOTE_SUMMARY_MODULES`) are optional; Yahoo omits a module entirely if it has nothing to report. */
export interface YahooQuoteSummaryResult {
  price?: YahooPriceModule;
  defaultKeyStatistics?: YahooDefaultKeyStatisticsModule;
  incomeStatementHistory?: YahooStatementHistoryModule;
  incomeStatementHistoryQuarterly?: YahooStatementHistoryModule;
  balanceSheetHistory?: YahooStatementHistoryModule;
  balanceSheetHistoryQuarterly?: YahooStatementHistoryModule;
  cashflowStatementHistory?: YahooStatementHistoryModule;
  cashflowStatementHistoryQuarterly?: YahooStatementHistoryModule;
  [module: string]: unknown;
}

export interface YahooQuoteSummaryError {
  code?: string;
  description?: string;
}

/** Top-level shape of a `quoteSummary` response body. `result` is `null` (with `error` populated) for an unknown ticker. */
export interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: YahooQuoteSummaryResult[] | null;
    error?: YahooQuoteSummaryError | null;
  };
}

/** Reads a Yahoo `{raw,fmt}`-or-bare-number field into a finite number, or `null` if absent/non-finite. */
export function readYahooNumber(value: YahooNumeric): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value !== null && typeof value === "object" && typeof value.raw === "number" && Number.isFinite(value.raw)) {
    return value.raw;
  }
  return null;
}

/** Reads a Yahoo `{raw,fmt}` date-like field (`endDate`, `regularMarketTime`, ...) as an ISO `YYYY-MM-DD` date string, or `null`. */
export function readYahooDate(value: YahooNumeric): string | null {
  if (value !== null && typeof value === "object" && typeof value.fmt === "string" && value.fmt.trim().length > 0) {
    return value.fmt;
  }
  const seconds = readYahooNumber(value);
  if (seconds === null) return null;
  const iso = new Date(seconds * 1000).toISOString();
  return iso.slice(0, 10);
}
