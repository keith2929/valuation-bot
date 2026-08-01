import type { MarketDescriptor } from "../marketDescriptor";

/** Explicit market suffix, e.g. "OCBC/SGX". */
const SGX_SLASH_SUFFIX_PATTERN = /\/SGX$/i;

/** Yahoo/Bloomberg-style Singapore Exchange suffix, e.g. "O39.SI". */
const SGX_DOT_SUFFIX_PATTERN = /\.SI$/i;

function stripSuffix(rawTicker: string): string {
  return rawTicker.replace(SGX_SLASH_SUFFIX_PATTERN, "").replace(SGX_DOT_SUFFIX_PATTERN, "");
}

/**
 * Singapore Exchange market descriptor. Matches an explicit `/SGX` suffix or
 * the `.SI` vendor convention. There is no EDGAR-equivalent regulatory
 * source wired in yet, so the SGX filing scraper leads `sourceOrder`,
 * followed by the same broadly-applicable vendor APIs and HTML fallback
 * used by other markets.
 */
export const SGX_MARKET: MarketDescriptor = {
  id: "SGX",
  label: "Singapore Exchange",
  exchange: "SGX",
  matches(rawTicker) {
    return SGX_SLASH_SUFFIX_PATTERN.test(rawTicker) || SGX_DOT_SUFFIX_PATTERN.test(rawTicker);
  },
  normalize(rawTicker) {
    return stripSuffix(rawTicker).toUpperCase();
  },
  sourceOrder: ["sgx-filing", "vendor-api", "html-scraper"],
};
