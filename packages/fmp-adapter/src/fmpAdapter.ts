/**
 * The Financial Modeling Prep (Tier 2) source adapter.
 *
 * FMP is a licensed market-data vendor covering both financial statements and
 * live market facts. This adapter:
 *   1. fetches annual (5-10y) and quarterly income-statement,
 *      balance-sheet-statement, and cash-flow-statement rows,
 *   2. fetches `/profile` and `/quote` for company/market meta (name,
 *      exchange, currency, shares outstanding, current price), and
 *   3. normalizes both into the canonical shape, preserving each raw value,
 *      its currency, and period-end date, with per-field provenance
 *      (source=FMP, tier=2).
 *
 * Per the `SourceAdapter` contract it NEVER throws: every failure path
 * returns a partial `AdapterFragment` with `CanonicalError` notes, or the
 * `RateLimited` sentinel when FMP throttles us. FMP signals exhaustion two
 * ways - an HTTP 429 (handled by `fetchWithRetry`'s own retry loop) and an
 * HTTP-200 body carrying `{ "Error Message": "...limit..." }` (detected here)
 * - both fold into the same `rateLimited()` sentinel so the orchestrator can
 * fall through to the next source either way.
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
  FMP_SOURCE,
  FMP_TIER,
  hasApiKey,
  resolveFmpConfig,
  withApiKey,
  type FmpConfig,
  type ResolvedFmpConfig,
} from "./config";
import { buildMetaResult, type FmpProfileRow, type FmpQuoteRow } from "./meta";
import { buildStatement, type FmpStatementRow } from "./statements";

/** The three canonical statements, in the order the adapter fetches/emits them. */
const STATEMENT_NAMES: (keyof CanonicalFinancials)[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/** FMP's REST path segment for each canonical statement. */
const STATEMENT_PATHS: Record<keyof CanonicalFinancials, string> = {
  incomeStatement: "income-statement",
  balanceSheet: "balance-sheet-statement",
  cashFlow: "cash-flow-statement",
};

type StatementFrequency = "annual" | "quarterly";

/** Discriminated outcome of a single JSON GET against FMP. */
type JsonOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "error"; message: string };

/** Every field FMP's error-response bodies use is optional and dynamic, so this is deliberately loose. */
interface FmpErrorBody {
  "Error Message"?: unknown;
}

function asErrorBody(value: unknown): FmpErrorBody | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as FmpErrorBody) : null;
}

/**
 * FMP returns HTTP 200 even when a request is rejected, with a JSON body
 * like `{ "Error Message": "Limit Reach . Please upgrade your plan..." }`.
 * Returns that message when the body matches this shape and the message
 * itself indicates a usage/rate limit (as opposed to e.g. an invalid ticker).
 */
export function extractRateLimitMessage(body: unknown): string | null {
  const errorBody = asErrorBody(body);
  if (errorBody === null) return null;
  const message = errorBody["Error Message"];
  if (typeof message !== "string" || message.length === 0) return null;
  return /limit/i.test(message) ? message : null;
}

/** Any other `{ "Error Message": "..." }` body FMP returns (invalid API key, unknown endpoint, etc.), not otherwise a rate limit. */
export function extractErrorMessage(body: unknown): string | null {
  const errorBody = asErrorBody(body);
  if (errorBody === null) return null;
  const message = errorBody["Error Message"];
  return typeof message === "string" && message.length > 0 ? message : null;
}

function fmpHeaders(): Record<string, string> {
  return { Accept: "application/json" };
}

async function getJson<T>(url: string, config: ResolvedFmpConfig): Promise<JsonOutcome<T>> {
  const outcome = await fetchWithRetry(url, { headers: fmpHeaders() }, config.http);
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

function buildStatementUrl(
  config: ResolvedFmpConfig,
  statementName: keyof CanonicalFinancials,
  frequency: StatementFrequency,
  ticker: string,
): string {
  const period = frequency === "annual" ? "annual" : "quarter";
  const limit = frequency === "annual" ? config.maxAnnualPeriods : config.maxQuarterlyPeriods;
  const base = `${config.baseUrl}/${STATEMENT_PATHS[statementName]}/${encodeURIComponent(ticker)}?period=${period}&limit=${limit}`;
  return withApiKey(base, config.apiKey);
}

function profileUrl(config: ResolvedFmpConfig, ticker: string): string {
  return withApiKey(`${config.baseUrl}/profile/${encodeURIComponent(ticker)}`, config.apiKey);
}

function quoteUrl(config: ResolvedFmpConfig, ticker: string): string {
  return withApiKey(`${config.baseUrl}/quote/${encodeURIComponent(ticker)}`, config.apiKey);
}

function firstRow<T>(outcome: JsonOutcome<T[]>): T | null {
  if (outcome.kind !== "ok") return null;
  return Array.isArray(outcome.data) && outcome.data.length > 0 ? (outcome.data[0] ?? null) : null;
}

interface StatementTask {
  statementName: keyof CanonicalFinancials;
  frequency: StatementFrequency;
}

const STATEMENT_TASKS: StatementTask[] = STATEMENT_NAMES.flatMap((statementName) => [
  { statementName, frequency: "annual" as const },
  { statementName, frequency: "quarterly" as const },
]);

async function buildFinancialsFragment(ticker: string, config: ResolvedFmpConfig): Promise<FetchFinancialsResult> {
  const outcomes = await Promise.all(
    STATEMENT_TASKS.map((task) =>
      getJson<FmpStatementRow[]>(buildStatementUrl(config, task.statementName, task.frequency, ticker), config),
    ),
  );

  const rateLimitedOutcome = outcomes.find((outcome) => outcome.kind === "rateLimited");
  if (rateLimitedOutcome && rateLimitedOutcome.kind === "rateLimited") {
    return rateLimited(FMP_SOURCE, rateLimitedOutcome.retryAfterMs);
  }

  const fragment = createEmptyAdapterFragment();
  const rowsByStatement: Record<keyof CanonicalFinancials, { annual: FmpStatementRow[]; quarterly: FmpStatementRow[] }> = {
    incomeStatement: { annual: [], quarterly: [] },
    balanceSheet: { annual: [], quarterly: [] },
    cashFlow: { annual: [], quarterly: [] },
  };

  STATEMENT_TASKS.forEach((task, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;
    if (outcome.kind === "error") {
      fragment.errors.push(
        adapterError(FMP_SOURCE, `could not load ${task.statementName} (${task.frequency}): ${outcome.message}`, {
          code: "STATEMENT_UNAVAILABLE",
          field: `${task.statementName}.${task.frequency}`,
        }),
      );
      return;
    }
    if (outcome.kind === "ok") {
      if (!Array.isArray(outcome.data)) {
        fragment.errors.push(
          adapterError(FMP_SOURCE, `unexpected response shape for ${task.statementName} (${task.frequency})`, {
            code: "UNEXPECTED_RESPONSE_SHAPE",
            field: `${task.statementName}.${task.frequency}`,
          }),
        );
        return;
      }
      rowsByStatement[task.statementName][task.frequency] = outcome.data;
    }
  });

  for (const statementName of STATEMENT_NAMES) {
    const { statement, provenance, missingTags } = buildStatement(statementName, rowsByStatement[statementName], {
      maxAnnualPeriods: config.maxAnnualPeriods,
      maxQuarterlyPeriods: config.maxQuarterlyPeriods,
    });
    fragment.financials[statementName] = statement;
    Object.assign(fragment.provenance.financials, provenance);
    for (const tag of missingTags) {
      fragment.errors.push(
        adapterError(FMP_SOURCE, `no FMP field found for ${statementName}.${tag}`, {
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

async function buildMetaFragment(ticker: string, config: ResolvedFmpConfig): Promise<ResolveMetaResult> {
  const [profileOutcome, quoteOutcome] = await Promise.all([
    getJson<FmpProfileRow[]>(profileUrl(config, ticker), config),
    getJson<FmpQuoteRow[]>(quoteUrl(config, ticker), config),
  ]);

  if (profileOutcome.kind === "rateLimited") return rateLimited(FMP_SOURCE, profileOutcome.retryAfterMs);
  if (quoteOutcome.kind === "rateLimited") return rateLimited(FMP_SOURCE, quoteOutcome.retryAfterMs);

  const fragment = createEmptyAdapterFragment();
  const errors: CanonicalError[] = [];

  if (profileOutcome.kind === "error") {
    errors.push(
      adapterError(FMP_SOURCE, `could not load profile for "${ticker}": ${profileOutcome.message}`, {
        code: "PROFILE_UNAVAILABLE",
        field: null,
      }),
    );
  }
  if (quoteOutcome.kind === "error") {
    errors.push(
      adapterError(FMP_SOURCE, `could not load quote for "${ticker}": ${quoteOutcome.message}`, {
        code: "QUOTE_UNAVAILABLE",
        field: null,
      }),
    );
  }

  const profileRow = profileOutcome.kind === "ok" ? firstRow(profileOutcome) : null;
  const quoteRow = quoteOutcome.kind === "ok" ? firstRow(quoteOutcome) : null;
  const fetchTimestamp = new Date().toISOString();

  const { meta, provenance, missingFields } = buildMetaResult(ticker, profileRow, quoteRow, fetchTimestamp);
  fragment.meta = meta;
  Object.assign(fragment.provenance.meta, provenance);

  for (const field of missingFields) {
    errors.push(
      adapterError(FMP_SOURCE, `${field} could not be resolved from FMP's profile/quote for "${ticker}"`, {
        field,
        code: MISSING_FIELD_CODES[field] ?? "MISSING_FIELD",
      }),
    );
  }

  // FMP's profile/quote endpoints carry no fiscal year-end; only the statement endpoints do.
  errors.push(
    adapterError(FMP_SOURCE, "fiscalYearEnd is not available from FMP's profile/quote endpoints", {
      field: "fiscalYearEnd",
      code: "MISSING_FISCAL_YEAR_END",
    }),
  );

  fragment.errors = errors;
  return fragment;
}

/**
 * Constructs an FMP `SourceAdapter` bound to `config`. The FMP API key (and
 * any endpoint/retry overrides) are captured here; the
 * `resolveMeta`/`fetchFinancials` calls the orchestrator makes carry only a
 * ticker, per the contract. If `config.apiKey` is missing/blank,
 * `isAvailable` returns false so the orchestrator skips this adapter cleanly
 * rather than calling it.
 */
export function createFmpAdapter(config: FmpConfig): SourceAdapter<FmpConfig> {
  const resolved = resolveFmpConfig(config);

  return {
    name: FMP_SOURCE,
    tier: FMP_TIER,
    isAvailable(cfg: FmpConfig): boolean {
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
