/**
 * Configuration + constants for the SEC EDGAR (Tier 1) source adapter.
 *
 * EDGAR is the SEC's official, free, US-only filing system. It requires a
 * descriptive `User-Agent` header on every request (per the SEC's fair-access
 * policy, e.g. "Acme Research admin@acme.example"); requests without one are
 * throttled/blocked. That header is the only piece of config an adapter
 * genuinely needs, so `isAvailable` keys off it.
 */
import type { HttpRetryConfig } from "@valuation-bot/source-adapter";

import type { AdapterConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. Matches the US market descriptor's `sourceOrder`. */
export const EDGAR_SOURCE = "edgar";

/** EDGAR is a primary regulatory filing source: the most authoritative tier. */
export const EDGAR_TIER = 1;

/**
 * Confidence attached to every EDGAR-sourced field. As-reported values pulled
 * straight from an official filing are about as trustworthy as data gets, but
 * concept-to-canonical mapping (which us-gaap tag a company chose) still
 * carries a little ambiguity, so this is high but not a hard 1.0.
 */
export const EDGAR_CONFIDENCE = 0.98;

/** Default SEC endpoint for the ticker -> CIK mapping file. */
export const DEFAULT_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

/** Default base for the XBRL companyfacts API; the CIK-specific path is appended by the adapter. */
export const DEFAULT_COMPANY_FACTS_BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts";

/** Keep at most this many fiscal years of annual periods (schema expects 5-10 where available). */
export const DEFAULT_MAX_ANNUAL_PERIODS = 10;

/** Keep at most this many of the most-recent quarterly periods. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 8;

/**
 * How long a fetched `company_tickers.json` mapping stays cached before the
 * adapter will refetch it. The SEC republishes this file a few times a day
 * at most, so a long TTL avoids hammering it on every ticker lookup without
 * risking meaningfully stale data.
 */
export const DEFAULT_TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Public, opaque-to-the-contract config for the EDGAR adapter. `userAgent` is
 * required by the SEC; everything else has a sane default so callers can pass
 * just `{ userAgent }`. `http` is forwarded to `fetchWithRetry`, primarily so
 * tests can inject a `fetchImpl`/`sleep` and tune retries.
 */
export interface EdgarConfig extends AdapterConfig {
  /** SEC-required descriptive User-Agent, e.g. "Acme Research admin@acme.example". */
  userAgent: string;
  companyTickersUrl?: string;
  companyFactsBaseUrl?: string;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
  /** How long to cache the fetched `company_tickers.json` mapping, in ms. Defaults to 24h. */
  tickerCacheTtlMs?: number;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedEdgarConfig {
  userAgent: string;
  companyTickersUrl: string;
  companyFactsBaseUrl: string;
  maxAnnualPeriods: number;
  maxQuarterlyPeriods: number;
  tickerCacheTtlMs: number;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `EdgarConfig`, producing a `ResolvedEdgarConfig`. */
export function resolveEdgarConfig(config: EdgarConfig): ResolvedEdgarConfig {
  return {
    userAgent: config.userAgent,
    companyTickersUrl: config.companyTickersUrl ?? DEFAULT_COMPANY_TICKERS_URL,
    companyFactsBaseUrl: config.companyFactsBaseUrl ?? DEFAULT_COMPANY_FACTS_BASE_URL,
    maxAnnualPeriods: config.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS,
    maxQuarterlyPeriods: config.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS,
    tickerCacheTtlMs: config.tickerCacheTtlMs ?? DEFAULT_TICKER_CACHE_TTL_MS,
    http: config.http ?? {},
  };
}

/** True iff `config` carries a non-empty SEC User-Agent - the one thing EDGAR strictly requires. */
export function hasUserAgent(config: EdgarConfig | undefined | null): boolean {
  return typeof config?.userAgent === "string" && config.userAgent.trim().length > 0;
}

/** Builds the request headers every EDGAR call must carry, including the required User-Agent. */
export function edgarHeaders(config: ResolvedEdgarConfig): Record<string, string> {
  return {
    "User-Agent": config.userAgent,
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
}
