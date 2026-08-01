/**
 * Configuration + constants for the Polygon.io (Tier 2) source adapter.
 *
 * Polygon is a licensed market-data vendor: broader cross-market coverage
 * than a single regulator's filing archive, but one step removed from the
 * as-filed source, so it sits at Tier 2 alongside FMP and Alpha Vantage,
 * behind EDGAR. Every request is authenticated with an API key query
 * parameter (`apiKey`); no key means the adapter simply isn't available for
 * this run.
 */
import type { AdapterConfig, HttpRetryConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. */
export const POLYGON_SOURCE = "polygon";

/** Polygon is a licensed market-data vendor, one step removed from an as-filed primary source. */
export const POLYGON_TIER = 2;

/**
 * Confidence attached to every Polygon-sourced field. Vendor-normalized
 * figures are generally reliable but carry restatement lag and occasional
 * mapping quirks relative to a primary filing, so this sits alongside
 * `FMP_CONFIDENCE` (0.85).
 */
export const POLYGON_CONFIDENCE = 0.85;

/** Default base for Polygon's REST API; reference/aggregates paths are appended by the adapter. */
export const DEFAULT_BASE_URL = "https://api.polygon.io";

/** Keep at most this many fiscal years of annual periods (schema expects 5-10 where available). */
export const DEFAULT_MAX_ANNUAL_PERIODS = 10;

/** Keep at most this many of the most-recent quarterly periods. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 8;

/**
 * Public, opaque-to-the-contract config for the Polygon adapter. `apiKey` is
 * required by Polygon; everything else has a sane default so callers can
 * pass just `{ apiKey }`. `http` is forwarded to `fetchWithRetry`, primarily
 * so tests can inject a `fetchImpl`/`sleep` and tune retries.
 */
export interface PolygonConfig extends AdapterConfig {
  /** Polygon API key, sent as the `apiKey` query parameter on every request. */
  apiKey: string;
  baseUrl?: string;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedPolygonConfig {
  apiKey: string;
  baseUrl: string;
  maxAnnualPeriods: number;
  maxQuarterlyPeriods: number;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `PolygonConfig`, producing a `ResolvedPolygonConfig`. */
export function resolvePolygonConfig(config: PolygonConfig): ResolvedPolygonConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    maxAnnualPeriods: config.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS,
    maxQuarterlyPeriods: config.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS,
    http: config.http ?? {},
  };
}

/** True iff `config` carries a non-empty Polygon API key - the one thing Polygon strictly requires. */
export function hasApiKey(config: PolygonConfig | undefined | null): boolean {
  return typeof config?.apiKey === "string" && config.apiKey.trim().length > 0;
}

/** Appends the `apiKey` query parameter to `path` (a full URL or base-relative path already carrying its own query string, if any). */
export function withApiKey(url: string, apiKey: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}apiKey=${encodeURIComponent(apiKey)}`;
}
