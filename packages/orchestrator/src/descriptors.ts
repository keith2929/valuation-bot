/**
 * Orchestrator-owned market descriptors.
 *
 * The `@valuation-bot/ticker-resolver` package ships DEFAULT_MARKET_DESCRIPTORS
 * whose `sourceOrder` uses abstract slot names ("vendor-api", "html-scraper",
 * "sgx-filing") rather than the concrete `SourceAdapter.name` values the real
 * adapters expose ("fmp", "polygon", "yfinance", ...). Those placeholder names
 * are deliberate - they let the resolver be unit-tested without any real
 * adapter wired up - and the resolver is explicitly designed to accept
 * caller-supplied descriptors "in place of" its defaults.
 *
 * This module is that caller: it reuses each built-in descriptor's matching
 * and normalization logic verbatim, but replaces `sourceOrder` with the real
 * adapter names, ordered most-authoritative-first (which coincides with
 * ascending adapter tier). The orchestration loop then re-sorts strictly by
 * `SourceAdapter.tier` as a safety net, so this ordering only decides ties
 * within a tier.
 */
import { SGX_MARKET, US_MARKET, type MarketDescriptor } from "@valuation-bot/ticker-resolver";

/**
 * US source order, most-authoritative-first: EDGAR (the SEC's primary,
 * US-only regulatory filing source) leads, then the broadly-applicable
 * vendor APIs, then the best-effort Yahoo scraper, and finally the Tier 4
 * HTML scraper as the last-resort fallthrough once every higher tier has
 * been exhausted.
 */
export const US_ADAPTER_ORDER = ["edgar", "fmp", "polygon", "alphavantage", "yfinance", "html"] as const;

/**
 * SGX source order: there is no EDGAR-equivalent regulatory adapter wired in
 * for Singapore yet, so the same market-data vendors lead, followed by the
 * Yahoo fallback (which serves `.SI` symbols) and the Tier 4 HTML scraper
 * last.
 */
export const SGX_ADAPTER_ORDER = ["fmp", "polygon", "alphavantage", "yfinance", "html"] as const;

/**
 * The market descriptors the orchestration loop hands to the resolver. Most
 * specific first (SGX before US) so an explicit `/SGX` or `.SI` ticker is
 * never mistaken for a bare US symbol - the same precedence the built-in
 * defaults use.
 */
export const ORCHESTRATOR_MARKET_DESCRIPTORS: MarketDescriptor[] = [
  { ...SGX_MARKET, sourceOrder: [...SGX_ADAPTER_ORDER] },
  { ...US_MARKET, sourceOrder: [...US_ADAPTER_ORDER] },
];
