/**
 * Configuration + constants for the "yfinance-class" (Tier 3) source adapter.
 *
 * This adapter mirrors what the popular `yfinance` Python library does: it
 * scrapes Yahoo Finance's unofficial, undocumented `quoteSummary` JSON
 * endpoint rather than calling a licensed, contractual API. There is no API
 * key - authorization is a short-lived "crumb" token paired with a consent
 * cookie, both obtained from Yahoo's own frontend at request time (see
 * `session.ts`). Because the endpoint is unofficial, undocumented, and known
 * to change or block requests without notice, this source sits at Tier 3
 * (secondary/aggregator, least authoritative) and is treated as strictly
 * optional: `config.enabled` lets a caller switch it off outright, and even
 * when enabled, any failure to obtain a crumb/cookie or to reach the endpoint
 * degrades to an empty result with explanatory `CanonicalError`s rather than
 * blocking or throwing - Tier 1/2 sources never depend on this one working.
 */
import type { AdapterConfig, HttpRetryConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. */
export const YFINANCE_SOURCE = "yfinance";

/** Unofficial/scraped secondary source - the least authoritative tier in this pipeline's ladder. */
export const YFINANCE_TIER = 3;

/**
 * Confidence attached to every yfinance-sourced field. Lower than any Tier 2
 * licensed vendor (FMP 0.85, Alpha Vantage 0.8, Polygon 0.85): the endpoint is
 * undocumented, unversioned, and can be throttled or reshaped without notice.
 */
export const YFINANCE_CONFIDENCE = 0.5;

/** Yahoo's unofficial quoteSummary endpoint - the same one `yfinance` itself calls under the hood. */
export const DEFAULT_QUOTE_SUMMARY_BASE_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

/** Yahoo's unofficial crumb-issuing endpoint; requires the consent cookie from `consentCookieUrl` first. */
export const DEFAULT_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";

/** Yahoo's cookie-issuing endpoint, hit once (per adapter call) to obtain the consent cookie a crumb request requires. */
export const DEFAULT_CONSENT_COOKIE_URL = "https://fc.yahoo.com";

/**
 * Yahoo's free/unofficial `quoteSummary` statement history is shallow (a
 * handful of most-recent periods) compared to a licensed vendor or regulatory
 * filing archive - unlike `DEFAULT_MAX_ANNUAL_PERIODS` on Tier 1/2 adapters
 * (5-10y), this defaults to what the endpoint actually tends to return.
 */
export const DEFAULT_MAX_ANNUAL_PERIODS = 4;

/** Keep at most this many of the most-recent quarterly periods. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 4;

/** The `quoteSummary` modules this adapter requests; covers meta (price, key stats) and all three core statements. */
export const QUOTE_SUMMARY_MODULES = [
  "price",
  "defaultKeyStatistics",
  "incomeStatementHistory",
  "incomeStatementHistoryQuarterly",
  "balanceSheetHistory",
  "balanceSheetHistoryQuarterly",
  "cashflowStatementHistory",
  "cashflowStatementHistoryQuarterly",
] as const;

/**
 * Public, opaque-to-the-contract config for the yfinance-class adapter.
 * Everything is optional - unlike a licensed vendor, there is no required API
 * key. `enabled` is the explicit off-switch (defaults to `true`): a caller
 * (or an ops runbook, given this scrapes an undocumented endpoint) can flip
 * it to `false` to remove this source from tier ordering without touching
 * `sourceOrder` itself.
 */
export interface YfinanceConfig extends AdapterConfig {
  /** Explicit off-switch; defaults to `true`. Set `false` to self-disable this optional source entirely. */
  enabled?: boolean;
  quoteSummaryBaseUrl?: string;
  crumbUrl?: string;
  consentCookieUrl?: string;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedYfinanceConfig {
  enabled: boolean;
  quoteSummaryBaseUrl: string;
  crumbUrl: string;
  consentCookieUrl: string;
  maxAnnualPeriods: number;
  maxQuarterlyPeriods: number;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `YfinanceConfig`, producing a `ResolvedYfinanceConfig`. */
export function resolveYfinanceConfig(config: YfinanceConfig): ResolvedYfinanceConfig {
  return {
    enabled: config.enabled ?? true,
    quoteSummaryBaseUrl: config.quoteSummaryBaseUrl ?? DEFAULT_QUOTE_SUMMARY_BASE_URL,
    crumbUrl: config.crumbUrl ?? DEFAULT_CRUMB_URL,
    consentCookieUrl: config.consentCookieUrl ?? DEFAULT_CONSENT_COOKIE_URL,
    maxAnnualPeriods: config.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS,
    maxQuarterlyPeriods: config.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS,
    http: config.http ?? {},
  };
}

/** True unless `config.enabled` is explicitly `false` - the one thing that self-disables this optional source synchronously. */
export function isEnabled(config: YfinanceConfig | undefined | null): boolean {
  return config?.enabled !== false;
}
