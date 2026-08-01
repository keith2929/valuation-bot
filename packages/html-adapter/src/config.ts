/**
 * Configuration + constants for the Tier 4 HTML source adapter: scrapes a
 * published financials page (e.g. stockanalysis.com, Yahoo Finance's web
 * pages) rather than calling a documented API. This is the last-resort tier -
 * no authentication, no contract with the publisher, and the page layout can
 * change without notice - so it sits below every vendor-API tier.
 */
import type { AdapterConfig, HttpRetryConfig } from "@valuation-bot/source-adapter";

/** Stable `SourceAdapter.name` / `ProvenanceRecord.source` for this adapter. */
export const HTML_SOURCE = "html";

/** Scraped HTML is the last-resort, inferred/best-effort tier. */
export const HTML_TIER = 4;

/**
 * Confidence attached to every HTML-sourced field, once a later stage maps
 * parsed rows to canonical tags. Lower than any vendor-API tier (`YFINANCE_CONFIDENCE`
 * = 0.5 is the next lowest) because there is no schema contract with the
 * publisher - only a page layout that can change without notice.
 */
export const HTML_CONFIDENCE = 0.3;

/** Default base for stockanalysis.com's financial-statement pages. */
export const DEFAULT_BASE_URL = "https://stockanalysis.com/stocks";

/** Default `User-Agent` sent with every request; some publishers block requests with no/blank UA. */
export const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; valuation-bot/1.0; +https://github.com/valuation-bot)";

/** The three published-page sections this adapter knows how to locate. */
export type HtmlStatementKind = "incomeStatement" | "balanceSheet" | "cashFlow";

/** URL path segment stockanalysis.com uses for each statement kind. */
const STOCKANALYSIS_PATH_SEGMENT: Record<HtmlStatementKind, string> = {
  incomeStatement: "financials",
  balanceSheet: "financials/balance-sheet",
  cashFlow: "financials/cash-flow-statement",
};

/**
 * Public, opaque-to-the-contract config for the HTML adapter. Every field is
 * optional - the adapter has sane, hardcoded defaults and, unlike a vendor
 * API, requires no key to be "available".
 */
export interface HtmlConfig extends AdapterConfig {
  baseUrl?: string;
  userAgent?: string;
  http?: HttpRetryConfig;
}

/** Fully-defaulted config the adapter works against internally (no optionals to guard downstream). */
export interface ResolvedHtmlConfig {
  baseUrl: string;
  userAgent: string;
  http: HttpRetryConfig;
}

/** Applies defaults to a user-supplied `HtmlConfig`, producing a `ResolvedHtmlConfig`. */
export function resolveHtmlConfig(config: HtmlConfig = {}): ResolvedHtmlConfig {
  return {
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    http: config.http ?? {},
  };
}

/** Builds the URL for one statement's published page, given a resolved config. */
export function buildStatementUrl(ticker: string, statement: HtmlStatementKind, config: ResolvedHtmlConfig): string {
  const segment = STOCKANALYSIS_PATH_SEGMENT[statement];
  return `${config.baseUrl}/${encodeURIComponent(ticker)}/${segment}/`;
}
