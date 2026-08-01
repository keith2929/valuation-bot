/**
 * The Alpha Vantage (Tier 2) source adapter.
 *
 * Alpha Vantage is a licensed market-data vendor covering both financial
 * statements and live market facts. This adapter:
 *   1. fetches `INCOME_STATEMENT`, `BALANCE_SHEET`, and `CASH_FLOW` - each
 *      call returns both `annualReports` and `quarterlyReports` in one
 *      response, unlike FMP's separate annual/quarterly requests,
 *   2. fetches `OVERVIEW` and `GLOBAL_QUOTE` for company/market meta (name,
 *      exchange, currency, shares outstanding, current price), and
 *   3. normalizes both into the canonical shape, preserving each raw value,
 *      its currency, and period-end date, with per-field provenance
 *      (source=AlphaVantage, tier=2).
 *
 * Per the `SourceAdapter` contract it NEVER throws: every failure path
 * returns a partial `AdapterFragment` with `CanonicalError` notes, or the
 * `RateLimited` sentinel when Alpha Vantage throttles us. Alpha Vantage
 * signals exhaustion two ways - an HTTP 429 (handled by `fetchWithRetry`'s
 * own retry loop, rare in practice) and, far more commonly, an HTTP-200 body
 * carrying `{ "Note": "...standard API call frequency..." }` (or an
 * `"Information"` field with the same rate-limit wording) - both fold into
 * the same `rateLimited()` sentinel so the orchestrator can fall through to
 * the next source either way.
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
  ALPHA_VANTAGE_SOURCE,
  ALPHA_VANTAGE_TIER,
  buildAlphaVantageUrl,
  hasApiKey,
  resolveAlphaVantageConfig,
  type AlphaVantageConfig,
  type ResolvedAlphaVantageConfig,
} from "./config";
import { buildMetaResult, type AlphaVantageGlobalQuote, type AlphaVantageOverview } from "./meta";
import { buildStatement, type AlphaVantageStatementRow } from "./statements";

/** The three canonical statements, in the order the adapter fetches/emits them. */
const STATEMENT_NAMES: (keyof CanonicalFinancials)[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/** Alpha Vantage's `function` query-param value for each canonical statement. */
const STATEMENT_FUNCTIONS: Record<keyof CanonicalFinancials, string> = {
  incomeStatement: "INCOME_STATEMENT",
  balanceSheet: "BALANCE_SHEET",
  cashFlow: "CASH_FLOW",
};

/** Discriminated outcome of a single JSON GET against Alpha Vantage. */
type JsonOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "error"; message: string };

/** The three ways Alpha Vantage's 200-status error/throttle bodies show up; every field is optional and dynamic. */
interface AlphaVantageErrorBody {
  "Error Message"?: unknown;
  Note?: unknown;
  Information?: unknown;
}

/** Wording Alpha Vantage's `"Information"` field uses when the free/lower-tier request-frequency limit is hit (as opposed to e.g. a premium-only endpoint notice). */
const RATE_LIMIT_INFORMATION_PATTERN = /rate limit|frequency|calls per (day|minute)/i;

function asErrorBody(value: unknown): AlphaVantageErrorBody | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as AlphaVantageErrorBody) : null;
}

/**
 * Alpha Vantage signals its request-frequency limit two ways: a dedicated
 * `"Note"` field (always a throttle notice when present), or an
 * `"Information"` field whose wording matches the same rate-limit language
 * (Alpha Vantage sometimes routes the identical message through
 * `"Information"` instead of `"Note"` depending on the endpoint). Returns the
 * matching message, or null if `body` isn't a rate-limit signal.
 */
export function extractRateLimitMessage(body: unknown): string | null {
  const errorBody = asErrorBody(body);
  if (errorBody === null) return null;

  const note = errorBody.Note;
  if (typeof note === "string" && note.length > 0) return note;

  const information = errorBody.Information;
  if (typeof information === "string" && RATE_LIMIT_INFORMATION_PATTERN.test(information)) {
    return information;
  }

  return null;
}

/** Any other `"Error Message"`/`"Information"` body Alpha Vantage returns (invalid API key, invalid symbol, premium-only endpoint, ...), not otherwise a rate limit. */
export function extractErrorMessage(body: unknown): string | null {
  const errorBody = asErrorBody(body);
  if (errorBody === null) return null;

  const errorMessage = errorBody["Error Message"];
  if (typeof errorMessage === "string" && errorMessage.length > 0) return errorMessage;

  const information = errorBody.Information;
  if (typeof information === "string" && information.length > 0) return information;

  return null;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function alphaVantageHeaders(): Record<string, string> {
  return { Accept: "application/json" };
}

async function getJson<T>(url: string, config: ResolvedAlphaVantageConfig): Promise<JsonOutcome<T>> {
  const outcome = await fetchWithRetry(url, { headers: alphaVantageHeaders() }, config.http);
  if (outcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: outcome.retryAfterMs };
  }
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.body);
  } catch (err) {
    return {
      kind: "error",
      message: `failed to parse JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (extractRateLimitMessage(parsed) !== null) {
    return { kind: "rateLimited", retryAfterMs: null };
  }
  const errorMessage = extractErrorMessage(parsed);
  if (errorMessage !== null) {
    return { kind: "error", message: errorMessage };
  }

  return { kind: "ok", data: parsed as T };
}

/** Shape of an `INCOME_STATEMENT`/`BALANCE_SHEET`/`CASH_FLOW` response before its reports are split by frequency. */
interface AlphaVantageStatementResponse {
  symbol?: string;
  annualReports?: AlphaVantageStatementRow[];
  quarterlyReports?: AlphaVantageStatementRow[];
}

async function buildFinancialsFragment(ticker: string, config: ResolvedAlphaVantageConfig): Promise<FetchFinancialsResult> {
  const outcomes = await Promise.all(
    STATEMENT_NAMES.map((statementName) =>
      getJson<AlphaVantageStatementResponse>(buildAlphaVantageUrl(config, STATEMENT_FUNCTIONS[statementName], ticker), config),
    ),
  );

  const rateLimitedOutcome = outcomes.find((outcome) => outcome.kind === "rateLimited");
  if (rateLimitedOutcome && rateLimitedOutcome.kind === "rateLimited") {
    return rateLimited(ALPHA_VANTAGE_SOURCE, rateLimitedOutcome.retryAfterMs);
  }

  const fragment = createEmptyAdapterFragment();

  STATEMENT_NAMES.forEach((statementName, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;

    if (outcome.kind === "error") {
      fragment.errors.push(
        adapterError(ALPHA_VANTAGE_SOURCE, `could not load ${statementName}: ${outcome.message}`, {
          code: "STATEMENT_UNAVAILABLE",
          field: statementName,
        }),
      );
      return;
    }
    // Every "rateLimited" outcome already short-circuited the whole fetch
    // above; this narrows the type for the "ok" branch below.
    if (outcome.kind !== "ok") return;

    const data = outcome.data;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      fragment.errors.push(
        adapterError(ALPHA_VANTAGE_SOURCE, `unexpected response shape for ${statementName}`, {
          code: "UNEXPECTED_RESPONSE_SHAPE",
          field: statementName,
        }),
      );
      return;
    }

    const annual = Array.isArray(data.annualReports) ? data.annualReports : [];
    const quarterly = Array.isArray(data.quarterlyReports) ? data.quarterlyReports : [];

    const { statement, provenance, missingTags } = buildStatement(
      statementName,
      { annual, quarterly },
      { maxAnnualPeriods: config.maxAnnualPeriods, maxQuarterlyPeriods: config.maxQuarterlyPeriods },
    );
    fragment.financials[statementName] = statement;
    Object.assign(fragment.provenance.financials, provenance);
    for (const tag of missingTags) {
      fragment.errors.push(
        adapterError(ALPHA_VANTAGE_SOURCE, `no Alpha Vantage field found for ${statementName}.${tag}`, {
          field: `${statementName}.${tag}`,
          code: "MISSING_CONCEPT",
        }),
      );
    }
  });

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

async function buildMetaFragment(ticker: string, config: ResolvedAlphaVantageConfig): Promise<ResolveMetaResult> {
  const [overviewOutcome, quoteOutcome] = await Promise.all([
    getJson<AlphaVantageOverview>(buildAlphaVantageUrl(config, "OVERVIEW", ticker), config),
    getJson<{ "Global Quote"?: AlphaVantageGlobalQuote }>(buildAlphaVantageUrl(config, "GLOBAL_QUOTE", ticker), config),
  ]);

  if (overviewOutcome.kind === "rateLimited") return rateLimited(ALPHA_VANTAGE_SOURCE, overviewOutcome.retryAfterMs);
  if (quoteOutcome.kind === "rateLimited") return rateLimited(ALPHA_VANTAGE_SOURCE, quoteOutcome.retryAfterMs);

  const fragment = createEmptyAdapterFragment();
  const errors: CanonicalError[] = [];

  if (overviewOutcome.kind === "error") {
    errors.push(
      adapterError(ALPHA_VANTAGE_SOURCE, `could not load overview for "${ticker}": ${overviewOutcome.message}`, {
        code: "OVERVIEW_UNAVAILABLE",
        field: null,
      }),
    );
  }
  if (quoteOutcome.kind === "error") {
    errors.push(
      adapterError(ALPHA_VANTAGE_SOURCE, `could not load quote for "${ticker}": ${quoteOutcome.message}`, {
        code: "QUOTE_UNAVAILABLE",
        field: null,
      }),
    );
  }

  // An unknown symbol resolves HTTP 200 with an empty `{}` (OVERVIEW) or
  // `{ "Global Quote": {} }` (GLOBAL_QUOTE) rather than an error body -
  // treat an empty object the same as "no data", not a parseable row.
  const overviewRow = overviewOutcome.kind === "ok" && isNonEmptyObject(overviewOutcome.data) ? overviewOutcome.data : null;
  const globalQuote = quoteOutcome.kind === "ok" ? quoteOutcome.data?.["Global Quote"] : undefined;
  const quoteRow = isNonEmptyObject(globalQuote) ? globalQuote : null;

  const fetchTimestamp = new Date().toISOString();
  const { meta, provenance, missingFields } = buildMetaResult(ticker, overviewRow, quoteRow, fetchTimestamp);
  fragment.meta = meta;
  Object.assign(fragment.provenance.meta, provenance);

  for (const field of missingFields) {
    errors.push(
      adapterError(ALPHA_VANTAGE_SOURCE, `${field} could not be resolved from Alpha Vantage's OVERVIEW/GLOBAL_QUOTE for "${ticker}"`, {
        field,
        code: MISSING_FIELD_CODES[field] ?? "MISSING_FIELD",
      }),
    );
  }

  // OVERVIEW.FiscalYearEnd is only ever a month name (e.g. "December"), never a full date - not enough to fill an IsoDate without guessing a day.
  errors.push(
    adapterError(ALPHA_VANTAGE_SOURCE, "fiscalYearEnd is not available as a full date from Alpha Vantage's OVERVIEW (only the fiscal year-end month)", {
      field: "fiscalYearEnd",
      code: "MISSING_FISCAL_YEAR_END",
    }),
  );

  fragment.errors = errors;
  return fragment;
}

/**
 * Constructs an Alpha Vantage `SourceAdapter` bound to `config`. The API key
 * (and any endpoint/retry overrides) are captured here; the
 * `resolveMeta`/`fetchFinancials` calls the orchestrator makes carry only a
 * ticker, per the contract. If `config.apiKey` is missing/blank,
 * `isAvailable` returns false so the orchestrator skips this adapter cleanly
 * rather than calling it.
 */
export function createAlphaVantageAdapter(config: AlphaVantageConfig): SourceAdapter<AlphaVantageConfig> {
  const resolved = resolveAlphaVantageConfig(config);

  return {
    name: ALPHA_VANTAGE_SOURCE,
    tier: ALPHA_VANTAGE_TIER,
    isAvailable(cfg: AlphaVantageConfig): boolean {
      return hasApiKey(cfg);
    },
    async resolveMeta(ticker: string): Promise<ResolveMetaResult> {
      return buildMetaFragment(ticker, resolved);
    },
    async fetchFinancials(ticker: string): Promise<FetchFinancialsResult> {
      return buildFinancialsFragment(ticker, resolved);
    },
  };
}
