/**
 * Configuration + constants for the Alpha Vantage (Tier 2) source adapter.
 *
 * Alpha Vantage is a licensed market-data vendor: broader cross-market
 * coverage than a single regulator's filing archive, but one step removed
 * from the as-filed source, so it sits at Tier 2 alongside FMP, behind
 * EDGAR. Every request is authenticated with an API key query parameter
 * (`apikey`); no key means the adapter simply isn't available for this run.
 */
import type { AdapterConfig, HttpRetryConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. */
export const ALPHA_VANTAGE_SOURCE = "alphavantage";

/** Alpha Vantage is a licensed market-data vendor, one step removed from an as-filed primary source. */
export const ALPHA_VANTAGE_TIER = 2;

/**
 * Confidence attached to every Alpha Vantage-sourced field. Vendor-normalized
 * figures are generally reliable but Alpha Vantage's free/lower tiers carry
 * more restatement/mapping lag than a primary filing (or than FMP's fresher
 * feed), so this sits a touch below `FMP_CONFIDENCE` (0.85).
 */
export const ALPHA_VANTAGE_CONFIDENCE = 0.8;

/** Default base for Alpha Vantage's single query endpoint; every function (INCOME_STATEMENT, OVERVIEW, ...) is a query param, not a path segment. */
export const DEFAULT_BASE_URL = "https://www.alphavantage.co/query";

/** Keep at most this many fiscal years of annual periods (schema expects 5-10 where available). */
export const DEFAULT_MAX_ANNUAL_PERIODS = 10;

/** Keep at most this many of the most-recent quarterly periods. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 8;

/**
 * Public, opaque-to-the-contract config for the Alpha Vantage adapter.
 * `apiKey` is required by Alpha Vantage; everything else has a sane default
 * so callers can pass just `{ apiKey }`. `http` is forwarded to
 * `fetchWithRetry`, primarily so tests can inject a `fetchImpl`/`sleep` and
 * tune retries.
 */
export interface AlphaVantageConfig extends AdapterConfig {
  /** Alpha Vantage API key, sent as the `apikey` query parameter on every request. */
  apiKey: string;
  baseUrl?: string;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedAlphaVantageConfig {
  apiKey: string;
  baseUrl: string;
  maxAnnualPeriods: number;
  maxQuarterlyPeriods: number;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `AlphaVantageConfig`, producing a `ResolvedAlphaVantageConfig`. */
export function resolveAlphaVantageConfig(config: AlphaVantageConfig): ResolvedAlphaVantageConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    maxAnnualPeriods: config.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS,
    maxQuarterlyPeriods: config.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS,
    http: config.http ?? {},
  };
}

/** True iff `config` carries a non-empty Alpha Vantage API key - the one thing Alpha Vantage strictly requires. */
export function hasApiKey(config: AlphaVantageConfig | undefined | null): boolean {
  return typeof config?.apiKey === "string" && config.apiKey.trim().length > 0;
}

/**
 * Builds a full Alpha Vantage query URL: every request goes to the same
 * `baseUrl` with `function`, `symbol`, and `apikey` as query parameters
 * (unlike FMP, which encodes the resource into the path).
 */
export function buildAlphaVantageUrl(config: ResolvedAlphaVantageConfig, functionName: string, symbol: string): string {
  const params = new URLSearchParams({ function: functionName, symbol, apikey: config.apiKey });
  return `${config.baseUrl}?${params.toString()}`;
}
