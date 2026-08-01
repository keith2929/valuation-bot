/**
 * The Polygon.io (Tier 2) source adapter.
 *
 * Polygon is a licensed market-data vendor. This adapter:
 *   1. fetches `/v3/reference/tickers/{ticker}` ("ticker details") for
 *      company/market identity (name, exchange, currency, shares
 *      outstanding),
 *   2. fetches `/v2/last/trade/{ticker}` ("last trade") for the current
 *      price, and
 *   3. normalizes both into the canonical meta shape, with per-field
 *      provenance (source=polygon, tier=2).
 *
 * Per the `SourceAdapter` contract it NEVER throws: every failure path
 * returns a partial `AdapterFragment` with `CanonicalError` notes, or the
 * `RateLimited` sentinel when Polygon throttles us. Polygon signals
 * exhaustion primarily via HTTP 429 (handled by `fetchWithRetry`'s own retry
 * loop), but also occasionally returns HTTP 200 with a
 * `{ "status": "ERROR", ... }` body whose message says the same thing - both
 * fold into the same `rateLimited()` sentinel so the orchestrator can fall
 * through to the next source either way.
 *
 * `fetchFinancials` fetches `vX/reference/financials` (once for `timeframe=annual`,
 * once for `timeframe=quarterly`) and normalizes both into the three core
 * canonical statements via `buildStatement` (see `financials.ts`), reusing
 * the same rate-limit/error detection as the meta half.
 */
import type { CanonicalError, CanonicalFinancials, CanonicalMeta } from "@valuation-bot/canonical";
import {
  adapterError,
  createEmptyAdapterFragment,
  fetchWithRetry,
  rateLimited,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";

import {
  POLYGON_SOURCE,
  POLYGON_TIER,
  hasApiKey,
  resolvePolygonConfig,
  withApiKey,
  type PolygonConfig,
  type ResolvedPolygonConfig,
} from "./config";
import { buildStatement, type PolygonFinancialsRow } from "./financials";
import { buildMetaResult, type PolygonLastTradeResult, type PolygonTickerDetailsResult } from "./meta";

/** The three canonical statements, in the order the adapter emits them. */
const STATEMENT_NAMES: (keyof CanonicalFinancials)[] = ["incomeStatement", "balanceSheet", "cashFlow"];

type FinancialsTimeframe = "annual" | "quarterly";

/** Discriminated outcome of a single JSON GET against Polygon. */
type JsonOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "error"; message: string };

/** The envelope every Polygon REST response wraps its payload in. */
interface PolygonEnvelope<T> {
  status?: unknown;
  error?: unknown;
  message?: unknown;
  results?: T;
}

/** Wording Polygon's error bodies use when the per-minute/per-day request quota is exhausted. */
const RATE_LIMIT_MESSAGE_PATTERN = /exceeded the maximum requests|too many requests|rate limit/i;

function asEnvelope(value: unknown): PolygonEnvelope<unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as PolygonEnvelope<unknown>) : null;
}

function envelopeMessage(envelope: PolygonEnvelope<unknown>): string | null {
  if (typeof envelope.error === "string" && envelope.error.length > 0) return envelope.error;
  if (typeof envelope.message === "string" && envelope.message.length > 0) return envelope.message;
  return null;
}

/**
 * Polygon almost always signals its request quota via an HTTP 429 (handled
 * by `fetchWithRetry`), but can also return HTTP 200 with a
 * `{ "status": "ERROR", "message": "...exceeded the maximum requests..." }`
 * body. Returns that message when the body matches this shape and the
 * wording indicates a usage/rate limit (as opposed to e.g. an unknown
 * ticker).
 */
export function extractRateLimitMessage(body: unknown): string | null {
  const envelope = asEnvelope(body);
  if (envelope === null) return null;
  if (envelope.status === "OK") return null;
  const message = envelopeMessage(envelope);
  if (message === null) return null;
  return RATE_LIMIT_MESSAGE_PATTERN.test(message) ? message : null;
}

/** Any other non-`"OK"`-status body Polygon returns (unknown ticker, invalid API key, ...), not otherwise a rate limit. */
export function extractErrorMessage(body: unknown): string | null {
  const envelope = asEnvelope(body);
  if (envelope === null) return null;
  if (envelope.status === "OK" || envelope.status === undefined) return null;
  return envelopeMessage(envelope) ?? `Polygon status: ${String(envelope.status)}`;
}

function polygonHeaders(): Record<string, string> {
  return { Accept: "application/json" };
}

async function getJson<T>(url: string, config: ResolvedPolygonConfig): Promise<JsonOutcome<PolygonEnvelope<T>>> {
  const outcome = await fetchWithRetry(url, { headers: polygonHeaders() }, config.http);
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

  return { kind: "ok", data: parsed as PolygonEnvelope<T> };
}

function tickerDetailsUrl(config: ResolvedPolygonConfig, ticker: string): string {
  return withApiKey(`${config.baseUrl}/v3/reference/tickers/${encodeURIComponent(ticker)}`, config.apiKey);
}

function lastTradeUrl(config: ResolvedPolygonConfig, ticker: string): string {
  return withApiKey(`${config.baseUrl}/v2/last/trade/${encodeURIComponent(ticker)}`, config.apiKey);
}

function financialsUrl(config: ResolvedPolygonConfig, ticker: string, timeframe: FinancialsTimeframe): string {
  const limit = timeframe === "annual" ? config.maxAnnualPeriods : config.maxQuarterlyPeriods;
  const base = `${config.baseUrl}/vX/reference/financials?ticker=${encodeURIComponent(ticker)}&timeframe=${timeframe}&limit=${limit}`;
  return withApiKey(base, config.apiKey);
}

/** `CanonicalMeta` fields whose absence gets a specific error code; anything else falls back to a generic one. */
const MISSING_FIELD_CODES: Partial<Record<keyof CanonicalMeta, string>> = {
  companyName: "MISSING_COMPANY_NAME",
  exchange: "MISSING_EXCHANGE",
  currency: "MISSING_CURRENCY",
  sharesOutstanding: "MISSING_SHARES_OUTSTANDING",
  currentPrice: "PRICE_NOT_AVAILABLE",
};

async function buildMetaFragment(ticker: string, config: ResolvedPolygonConfig): Promise<ResolveMetaResult> {
  const [detailsOutcome, lastTradeOutcome] = await Promise.all([
    getJson<PolygonTickerDetailsResult>(tickerDetailsUrl(config, ticker), config),
    getJson<PolygonLastTradeResult>(lastTradeUrl(config, ticker), config),
  ]);

  if (detailsOutcome.kind === "rateLimited") return rateLimited(POLYGON_SOURCE, detailsOutcome.retryAfterMs);
  if (lastTradeOutcome.kind === "rateLimited") return rateLimited(POLYGON_SOURCE, lastTradeOutcome.retryAfterMs);

  const errors: CanonicalError[] = [];

  if (detailsOutcome.kind === "error") {
    errors.push(
      adapterError(POLYGON_SOURCE, `could not load ticker details for "${ticker}": ${detailsOutcome.message}`, {
        code: "TICKER_DETAILS_UNAVAILABLE",
        field: null,
      }),
    );
  }
  if (lastTradeOutcome.kind === "error") {
    errors.push(
      adapterError(POLYGON_SOURCE, `could not load last trade for "${ticker}": ${lastTradeOutcome.message}`, {
        code: "LAST_TRADE_UNAVAILABLE",
        field: null,
      }),
    );
  }

  const detailsRow = detailsOutcome.kind === "ok" ? (detailsOutcome.data.results ?? null) : null;
  const lastTradeRow = lastTradeOutcome.kind === "ok" ? (lastTradeOutcome.data.results ?? null) : null;
  const fetchTimestamp = new Date().toISOString();

  const fragment = createEmptyAdapterFragment();
  const { meta, provenance, missingFields } = buildMetaResult(ticker, detailsRow, lastTradeRow, fetchTimestamp);
  fragment.meta = meta;
  Object.assign(fragment.provenance.meta, provenance);

  for (const field of missingFields) {
    errors.push(
      adapterError(POLYGON_SOURCE, `${field} could not be resolved from Polygon's ticker-details/last-trade for "${ticker}"`, {
        field,
        code: MISSING_FIELD_CODES[field] ?? "MISSING_FIELD",
      }),
    );
  }

  // Polygon's reference/market-data endpoints carry no fiscal calendar.
  errors.push(
    adapterError(POLYGON_SOURCE, "fiscalYearEnd is not available from Polygon's reference/market-data endpoints", {
      field: "fiscalYearEnd",
      code: "MISSING_FISCAL_YEAR_END",
    }),
  );

  fragment.errors = errors;
  return fragment;
}

/**
 * Fetches `vX/reference/financials` once per timeframe (annual, quarterly)
 * and normalizes both into the three core canonical statements. A rate limit
 * on either call short-circuits to the `RateLimited` sentinel; any other
 * failure on one timeframe folds into a `FINANCIALS_UNAVAILABLE` note and
 * that timeframe simply contributes no periods, rather than failing the
 * whole fetch.
 */
async function buildFinancialsFragment(ticker: string, config: ResolvedPolygonConfig): Promise<FetchFinancialsResult> {
  const [annualOutcome, quarterlyOutcome] = await Promise.all([
    getJson<PolygonFinancialsRow[]>(financialsUrl(config, ticker, "annual"), config),
    getJson<PolygonFinancialsRow[]>(financialsUrl(config, ticker, "quarterly"), config),
  ]);

  if (annualOutcome.kind === "rateLimited") return rateLimited(POLYGON_SOURCE, annualOutcome.retryAfterMs);
  if (quarterlyOutcome.kind === "rateLimited") return rateLimited(POLYGON_SOURCE, quarterlyOutcome.retryAfterMs);

  const fragment = createEmptyAdapterFragment();
  const rows: { annual: PolygonFinancialsRow[]; quarterly: PolygonFinancialsRow[] } = { annual: [], quarterly: [] };

  type SettledOutcome = { kind: "ok"; data: PolygonEnvelope<PolygonFinancialsRow[]> } | { kind: "error"; message: string };
  const timeframes: { timeframe: FinancialsTimeframe; outcome: SettledOutcome }[] = [
    { timeframe: "annual", outcome: annualOutcome as SettledOutcome },
    { timeframe: "quarterly", outcome: quarterlyOutcome as SettledOutcome },
  ];

  for (const { timeframe, outcome } of timeframes) {
    if (outcome.kind !== "ok") {
      fragment.errors.push(
        adapterError(POLYGON_SOURCE, `could not load ${timeframe} financials for "${ticker}": ${outcome.message}`, {
          code: "FINANCIALS_UNAVAILABLE",
          field: timeframe,
        }),
      );
      continue;
    }
    const data = outcome.data.results;
    if (!Array.isArray(data)) {
      fragment.errors.push(
        adapterError(POLYGON_SOURCE, `unexpected response shape for ${timeframe} financials`, {
          code: "UNEXPECTED_RESPONSE_SHAPE",
          field: timeframe,
        }),
      );
      continue;
    }
    rows[timeframe] = data;
  }

  for (const statementName of STATEMENT_NAMES) {
    const { statement, provenance, missingTags } = buildStatement(statementName, rows, {
      maxAnnualPeriods: config.maxAnnualPeriods,
      maxQuarterlyPeriods: config.maxQuarterlyPeriods,
    });
    fragment.financials[statementName] = statement;
    Object.assign(fragment.provenance.financials, provenance);
    for (const tag of missingTags) {
      fragment.errors.push(
        adapterError(POLYGON_SOURCE, `no Polygon field found for ${statementName}.${tag}`, {
          field: `${statementName}.${tag}`,
          code: "MISSING_CONCEPT",
        }),
      );
    }
  }

  return fragment;
}

/**
 * Constructs a Polygon `SourceAdapter` bound to `config`. The Polygon API key
 * (and any endpoint/retry overrides) are captured here; the
 * `resolveMeta`/`fetchFinancials` calls the orchestrator makes carry only a
 * ticker, per the contract. If `config.apiKey` is missing/blank,
 * `isAvailable` returns false so the orchestrator skips this adapter cleanly
 * rather than calling it.
 */
export function createPolygonAdapter(config: PolygonConfig): SourceAdapter<PolygonConfig> {
  const resolved = resolvePolygonConfig(config);

  return {
    name: POLYGON_SOURCE,
    tier: POLYGON_TIER,
    isAvailable(cfg: PolygonConfig): boolean {
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
