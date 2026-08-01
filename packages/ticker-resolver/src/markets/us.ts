import type { MarketDescriptor } from "../marketDescriptor";

/** Explicit market suffix, e.g. "AAPL/US", "AAPL/NYSE", "AAPL/NASDAQ", "AAPL/AMEX". */
const US_SUFFIX_PATTERN = /\/(US|NYSE|NASDAQ|AMEX)$/i;

/** Bare US-style ticker: 1-5 letters, optional single-letter share-class suffix (e.g. "BRK.B"). */
const US_BARE_TICKER_PATTERN = /^[A-Z]{1,5}(\.[A-Z])?$/i;

function stripSuffix(rawTicker: string): string {
  return rawTicker.replace(US_SUFFIX_PATTERN, "");
}

/**
 * US market descriptor. Matches an explicit `/US`-style suffix or a bare
 * alphabetic ticker (optionally with a share-class suffix like ".B"). EDGAR
 * (a US-only regulatory filing source) leads `sourceOrder`; vendor APIs
 * apply broadly across markets; an HTML scraper is the last resort.
 */
export const US_MARKET: MarketDescriptor = {
  id: "US",
  label: "United States",
  exchange: "US",
  matches(rawTicker) {
    return US_SUFFIX_PATTERN.test(rawTicker) || US_BARE_TICKER_PATTERN.test(rawTicker);
  },
  normalize(rawTicker) {
    return stripSuffix(rawTicker).toUpperCase();
  },
  sourceOrder: ["edgar", "vendor-api", "html-scraper"],
};
