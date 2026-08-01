/**
 * Normalization of Yahoo Finance's `quoteSummary` `price` and
 * `defaultKeyStatistics` modules into the canonical meta fields this adapter
 * can supply: company name, exchange, currency, shares outstanding, and
 * current price. Pure (modules in, fragment pieces out) so it can be tested
 * without any network; the adapter (`yfinanceAdapter.ts`) does the fetching.
 */
import type { CanonicalMeta, ProvenanceRecord } from "@valuation-bot/canonical";

import { YFINANCE_CONFIDENCE, YFINANCE_SOURCE, YFINANCE_TIER } from "./config";
import { readYahooNumber, type YahooDefaultKeyStatisticsModule, type YahooPriceModule } from "./types";

/** Result of normalizing `price` + `defaultKeyStatistics`: the partial meta fields resolved, their provenance, and which fields could not be filled. */
export interface MetaResult {
  meta: Partial<CanonicalMeta>;
  provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>>;
  /** `CanonicalMeta` field names Yahoo's `price`/`defaultKeyStatistics` modules did not supply. */
  missingFields: (keyof CanonicalMeta)[];
}

function metaProvenance(fetchTimestamp: string): ProvenanceRecord {
  return {
    source: YFINANCE_SOURCE,
    tier: YFINANCE_TIER,
    asOf: fetchTimestamp,
    periodEnd: null,
    rawUnits: null,
    confidence: YFINANCE_CONFIDENCE,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Builds `CanonicalMeta.ticker`, `companyName`, `exchange`, `currency`,
 * `sharesOutstanding`, and `currentPrice` from the `price` and
 * `defaultKeyStatistics` `quoteSummary` modules (either may be absent).
 * `fiscalYearEnd` is never in scope here - neither module reports it, so it
 * is always reported via `missingFields` (see `MISSING_FISCAL_YEAR_END` in
 * `yfinanceAdapter.ts`).
 */
export function buildMetaResult(
  ticker: string,
  price: YahooPriceModule | null,
  keyStatistics: YahooDefaultKeyStatisticsModule | null,
  fetchTimestamp: string,
): MetaResult {
  const meta: Partial<CanonicalMeta> = {};
  const provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>> = {};
  const missingFields: (keyof CanonicalMeta)[] = [];
  const prov = metaProvenance(fetchTimestamp);

  meta.ticker = price?.symbol ?? ticker;
  provenance.ticker = prov;

  const companyName = price?.longName ?? price?.shortName ?? null;
  if (isNonEmptyString(companyName)) {
    meta.companyName = companyName;
    provenance.companyName = prov;
  } else {
    missingFields.push("companyName");
  }

  const exchange = price?.exchangeName ?? null;
  if (isNonEmptyString(exchange)) {
    meta.exchange = exchange;
    provenance.exchange = prov;
  } else {
    missingFields.push("exchange");
  }

  const currency = price?.currency ?? null;
  if (isNonEmptyString(currency)) {
    meta.currency = currency;
    provenance.currency = prov;
  } else {
    missingFields.push("currency");
  }

  const sharesOutstanding = readYahooNumber(keyStatistics?.sharesOutstanding);
  if (sharesOutstanding !== null) {
    meta.sharesOutstanding = sharesOutstanding;
    provenance.sharesOutstanding = prov;
  } else {
    missingFields.push("sharesOutstanding");
  }

  const currentPrice = readYahooNumber(price?.regularMarketPrice);
  if (currentPrice !== null) {
    meta.currentPrice = currentPrice;
    provenance.currentPrice = prov;
  } else {
    missingFields.push("currentPrice");
  }

  meta.fetchTimestamp = fetchTimestamp;
  provenance.fetchTimestamp = prov;

  return { meta, provenance, missingFields };
}
