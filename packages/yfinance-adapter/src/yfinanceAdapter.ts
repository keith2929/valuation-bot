/**
 * The "yfinance-class" (Tier 3) source adapter.
 *
 * This adapter behaves like the popular `yfinance` Python library: it scrapes
 * Yahoo Finance's unofficial `quoteSummary` endpoint (no API key, just a
 * short-lived crumb + consent cookie obtained per-call - see `session.ts`)
 * for company/market meta and the three core financial statements, then
 * normalizes both into the canonical shape with per-field provenance
 * (source=yfinance, tier=3).
 *
 * It is deliberately last in tier ordering and entirely optional:
 *   - `isAvailable` self-disables synchronously via `config.enabled` (see
 *     `config.ts`), so a caller can drop this source without touching
 *     `sourceOrder`.
 *   - Even when enabled, obtaining the crumb/cookie or reaching the endpoint
 *     can fail for reasons outside this adapter's control (Yahoo changes or
 *     blocks the unofficial endpoint without notice); that failure
 *     self-disables the fetch for that call - a normal `AdapterFragment`
 *     with an explanatory `CanonicalError` and no data, not a thrown error -
 *     so Tier 1/2 sources are never blocked by this one being unavailable.
 * Per the `SourceAdapter` contract it NEVER throws.
 */
import type { CanonicalError, CanonicalFinancials, CanonicalMeta } from "@valuation-bot/canonical";
import {
  adapterError,
  createEmptyAdapterFragment,
  fetchWithRetry,
  rateLimited,
  type AdapterFragment,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";

import {
  QUOTE_SUMMARY_MODULES,
  YFINANCE_SOURCE,
  YFINANCE_TIER,
  isEnabled,
  resolveYfinanceConfig,
  type ResolvedYfinanceConfig,
  type YfinanceConfig,
} from "./config";
import { buildMetaResult } from "./meta";
import { fetchSession } from "./session";
import { buildStatement } from "./statements";
import type { YahooQuoteSummaryResponse, YahooQuoteSummaryResult, YahooStatementRow } from "./types";

/** The three canonical statements, in the order the adapter fetches/emits them. */
const STATEMENT_NAMES: (keyof CanonicalFinancials)[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/** `quoteSummary` module name (annual, quarterly) for each canonical statement, and the row array field within that module. */
const STATEMENT_MODULES: Record<
  keyof CanonicalFinancials,
  { annualModule: string; quarterlyModule: string; rowsField: string }
> = {
  incomeStatement: {
    annualModule: "incomeStatementHistory",
    quarterlyModule: "incomeStatementHistoryQuarterly",
    rowsField: "incomeStatementHistory",
  },
  balanceSheet: {
    annualModule: "balanceSheetHistory",
    quarterlyModule: "balanceSheetHistoryQuarterly",
    rowsField: "balanceSheetStatements",
  },
  cashFlow: {
    annualModule: "cashflowStatementHistory",
    quarterlyModule: "cashflowStatementHistoryQuarterly",
    rowsField: "cashflowStatements",
  },
};

/** Discriminated outcome of loading one ticker's `quoteSummary` result (session + fetch + parse, folded into one). */
type QuoteSummaryOutcome =
  | { kind: "ok"; result: YahooQuoteSummaryResult; fetchTimestamp: string }
  | { kind: "unavailable"; message: string }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "notFound"; message: string };

function buildQuoteSummaryUrl(config: ResolvedYfinanceConfig, ticker: string, crumb: string): string {
  const modules = QUOTE_SUMMARY_MODULES.join(",");
  return `${config.quoteSummaryBaseUrl}/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
}

/**
 * Obtains a session (crumb + cookie), fetches `quoteSummary` for `ticker`,
 * and parses the JSON body. Folds every failure mode - session unavailable,
 * rate limiting, network/HTTP error, malformed JSON, Yahoo's own
 * `{error: {...}}` body for an unrecognized ticker - into one outcome so
 * both `resolveMeta` and `fetchFinancials` can share this single (never
 * throwing) code path.
 */
async function loadQuoteSummary(ticker: string, config: ResolvedYfinanceConfig): Promise<QuoteSummaryOutcome> {
  const session = await fetchSession({
    consentCookieUrl: config.consentCookieUrl,
    crumbUrl: config.crumbUrl,
    http: config.http,
  });
  if (session.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: session.retryAfterMs };
  }
  if (session.kind === "unavailable") {
    return { kind: "unavailable", message: session.message };
  }

  const url = buildQuoteSummaryUrl(config, ticker, session.crumb);
  const outcome = await fetchWithRetry(url, { headers: { Cookie: session.cookie, Accept: "application/json" } }, config.http);
  if (outcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: outcome.retryAfterMs };
  }
  if (outcome.kind === "error") {
    return { kind: "unavailable", message: outcome.message };
  }

  let parsed: YahooQuoteSummaryResponse;
  try {
    parsed = JSON.parse(outcome.body) as YahooQuoteSummaryResponse;
  } catch (err) {
    return { kind: "unavailable", message: `failed to parse JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  const quoteSummaryError = parsed.quoteSummary?.error;
  if (quoteSummaryError) {
    return {
      kind: "notFound",
      message: quoteSummaryError.description ?? quoteSummaryError.code ?? `no quoteSummary result for "${ticker}"`,
    };
  }

  const result = parsed.quoteSummary?.result?.[0];
  if (!result) {
    return { kind: "notFound", message: `no quoteSummary result for "${ticker}"` };
  }

  return { kind: "ok", result, fetchTimestamp: new Date().toISOString() };
}

function statementRows(module: unknown, rowsField: string): YahooStatementRow[] {
  if (module === null || typeof module !== "object") return [];
  const rows = (module as Record<string, unknown>)[rowsField];
  return Array.isArray(rows) ? (rows as YahooStatementRow[]) : [];
}

function buildFinancialsFromResult(
  result: YahooQuoteSummaryResult,
  fetchTimestamp: string,
  config: ResolvedYfinanceConfig,
): AdapterFragment {
  const fragment = createEmptyAdapterFragment();

  for (const statementName of STATEMENT_NAMES) {
    const modules = STATEMENT_MODULES[statementName];
    const rows = {
      annual: statementRows(result[modules.annualModule], modules.rowsField),
      quarterly: statementRows(result[modules.quarterlyModule], modules.rowsField),
    };

    const { statement, provenance, missingTags } = buildStatement(statementName, rows, {
      maxAnnualPeriods: config.maxAnnualPeriods,
      maxQuarterlyPeriods: config.maxQuarterlyPeriods,
      fetchTimestamp,
    });
    fragment.financials[statementName] = statement;
    Object.assign(fragment.provenance.financials, provenance);

    if (rows.annual.length === 0 && rows.quarterly.length === 0) {
      fragment.errors.push(
        adapterError(YFINANCE_SOURCE, `Yahoo quoteSummary returned no ${statementName} history`, {
          field: statementName,
          code: "STATEMENT_UNAVAILABLE",
        }),
      );
      continue;
    }
    for (const tag of missingTags) {
      fragment.errors.push(
        adapterError(YFINANCE_SOURCE, `no Yahoo quoteSummary field found for ${statementName}.${tag}`, {
          field: `${statementName}.${tag}`,
          code: "MISSING_CONCEPT",
        }),
      );
    }
  }

  return fragment;
}

/** `CanonicalMeta` fields whose absence gets a specific error code; anything else falls back to a generic one. */
const MISSING_FIELD_CODES: Partial<Record<keyof CanonicalMeta, string>> = {
  companyName: "MISSING_COMPANY_NAME",
  exchange: "MISSING_EXCHANGE",
  currency: "MISSING_CURRENCY",
  sharesOutstanding: "MISSING_SHARES_OUTSTANDING",
  currentPrice: "PRICE_NOT_AVAILABLE",
};

function buildMetaFromResult(ticker: string, result: YahooQuoteSummaryResult, fetchTimestamp: string): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  const errors: CanonicalError[] = [];

  const { meta, provenance, missingFields } = buildMetaResult(
    ticker,
    result.price ?? null,
    result.defaultKeyStatistics ?? null,
    fetchTimestamp,
  );
  fragment.meta = meta;
  Object.assign(fragment.provenance.meta, provenance);

  for (const field of missingFields) {
    errors.push(
      adapterError(YFINANCE_SOURCE, `${field} could not be resolved from Yahoo's price/defaultKeyStatistics for "${ticker}"`, {
        field,
        code: MISSING_FIELD_CODES[field] ?? "MISSING_FIELD",
      }),
    );
  }

  // Neither the "price" nor "defaultKeyStatistics" quoteSummary module carries a fiscal year-end.
  errors.push(
    adapterError(YFINANCE_SOURCE, "fiscalYearEnd is not available from Yahoo's price/defaultKeyStatistics modules", {
      field: "fiscalYearEnd",
      code: "MISSING_FISCAL_YEAR_END",
    }),
  );

  fragment.errors = errors;
  return fragment;
}

/** Builds the single, self-disabling `AdapterFragment` every non-rate-limited failure path of `loadQuoteSummary` maps to. */
function unavailableFragment(
  outcome: Extract<QuoteSummaryOutcome, { kind: "unavailable" | "notFound" }>,
  ticker: string,
): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  const message =
    outcome.kind === "notFound"
      ? `Yahoo quoteSummary has no data for "${ticker}": ${outcome.message}`
      : `yfinance-class source unavailable for "${ticker}": ${outcome.message}`;
  const code = outcome.kind === "notFound" ? "TICKER_NOT_FOUND" : "SOURCE_UNAVAILABLE";
  fragment.errors.push(adapterError(YFINANCE_SOURCE, message, { code }));
  return fragment;
}

/**
 * Constructs a yfinance-class `SourceAdapter` bound to `config`. Unlike a
 * licensed vendor adapter, `isAvailable` requires no key - it is `true`
 * unless the caller explicitly set `config.enabled = false` (see
 * `isEnabled`). The deeper, runtime dependency (a working crumb/cookie
 * session against Yahoo's unofficial endpoint) can only be checked
 * asynchronously, so its failure surfaces as a normal empty-ish
 * `AdapterFragment` with a `SOURCE_UNAVAILABLE` error rather than changing
 * `isAvailable`'s answer.
 */
export function createYfinanceAdapter(config: YfinanceConfig): SourceAdapter<YfinanceConfig> {
  const resolved = resolveYfinanceConfig(config);

  return {
    name: YFINANCE_SOURCE,
    tier: YFINANCE_TIER,
    isAvailable(cfg: YfinanceConfig): boolean {
      return isEnabled(cfg);
    },
    async resolveMeta(ticker: string): Promise<ResolveMetaResult> {
      const outcome = await loadQuoteSummary(ticker, resolved);
      if (outcome.kind === "rateLimited") return rateLimited(YFINANCE_SOURCE, outcome.retryAfterMs);
      if (outcome.kind !== "ok") return unavailableFragment(outcome, ticker);
      return buildMetaFromResult(ticker, outcome.result, outcome.fetchTimestamp);
    },
    async fetchFinancials(ticker: string): Promise<FetchFinancialsResult> {
      const outcome = await loadQuoteSummary(ticker, resolved);
      if (outcome.kind === "rateLimited") return rateLimited(YFINANCE_SOURCE, outcome.retryAfterMs);
      if (outcome.kind !== "ok") return unavailableFragment(outcome, ticker);
      return buildFinancialsFromResult(outcome.result, outcome.fetchTimestamp, resolved);
    },
  };
}
