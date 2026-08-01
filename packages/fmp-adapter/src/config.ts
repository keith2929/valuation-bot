/**
 * Configuration + constants for the Financial Modeling Prep (Tier 2) source
 * adapter.
 *
 * FMP is a licensed market-data vendor: broader cross-market coverage than a
 * single regulator's filing archive, but one step removed from the
 * as-filed source, so it sits at Tier 2 behind EDGAR. Every request is
 * authenticated with an API key query parameter (`apikey`); no key means the
 * adapter simply isn't available for this run.
 */
import type { AdapterConfig } from "@valuation-bot/source-adapter";
import type { HttpRetryConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. */
export const FMP_SOURCE = "fmp";

/** FMP is a licensed market-data vendor, one step removed from an as-filed primary source. */
export const FMP_TIER = 2;

/**
 * Confidence attached to every FMP-sourced field. Vendor-normalized figures
 * are generally reliable but carry restatement lag and occasional mapping
 * quirks relative to a primary filing, so this sits below EDGAR's 0.98.
 */
export const FMP_CONFIDENCE = 0.85;

/** Default base for the FMP stable v3 REST API; statement/profile/quote paths are appended by the adapter. */
export const DEFAULT_BASE_URL = "https://financialmodelingprep.com/api/v3";

/** Keep at most this many fiscal years of annual periods (schema expects 5-10 where available). */
export const DEFAULT_MAX_ANNUAL_PERIODS = 10;

/** Keep at most this many of the most-recent quarterly periods. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 8;

/**
 * Public, opaque-to-the-contract config for the FMP adapter. `apiKey` is
 * required by FMP; everything else has a sane default so callers can pass
 * just `{ apiKey }`. `http` is forwarded to `fetchWithRetry`, primarily so
 * tests can inject a `fetchImpl`/`sleep` and tune retries.
 */
export interface FmpConfig extends AdapterConfig {
  /** FMP API key, sent as the `apikey` query parameter on every request. */
  apiKey: string;
  baseUrl?: string;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedFmpConfig {
  apiKey: string;
  baseUrl: string;
  maxAnnualPeriods: number;
  maxQuarterlyPeriods: number;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `FmpConfig`, producing a `ResolvedFmpConfig`. */
export function resolveFmpConfig(config: FmpConfig): ResolvedFmpConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    maxAnnualPeriods: config.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS,
    maxQuarterlyPeriods: config.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS,
    http: config.http ?? {},
  };
}

/** True iff `config` carries a non-empty FMP API key - the one thing FMP strictly requires. */
export function hasApiKey(config: FmpConfig | undefined | null): boolean {
  return typeof config?.apiKey === "string" && config.apiKey.trim().length > 0;
}

/** Appends the `apikey` query parameter to `path` (a full URL or base-relative path already carrying its own query string, if any). */
export function withApiKey(url: string, apiKey: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}apikey=${encodeURIComponent(apiKey)}`;
}
