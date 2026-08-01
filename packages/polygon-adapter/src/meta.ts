/**
 * Normalization of Polygon's `/v3/reference/tickers/{ticker}` ("ticker
 * details") and `/v2/last/trade/{ticker}` ("last trade") responses into the
 * canonical meta fields this adapter can supply: company name, exchange,
 * currency, shares outstanding, and current price. Pure (rows in, fragment
 * pieces out) so it can be tested without any network; the adapter
 * (`polygonAdapter.ts`) does the fetching.
 */
import type { CanonicalMeta, ProvenanceRecord } from "@valuation-bot/canonical";

import { POLYGON_CONFIDENCE, POLYGON_SOURCE, POLYGON_TIER } from "./config";

/** The `results` object of Polygon's `GET /v3/reference/tickers/{ticker}` response. */
export interface PolygonTickerDetailsResult {
  ticker?: string;
  name?: string;
  primary_exchange?: string;
  currency_name?: string;
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  [field: string]: unknown;
}

/** The `results` object of Polygon's `GET /v2/last/trade/{ticker}` response. */
export interface PolygonLastTradeResult {
  T?: string;
  /** Trade price. */
  p?: number;
  [field: string]: unknown;
}

/** Result of normalizing ticker details + last trade: the partial meta fields resolved, their provenance, and which fields could not be filled. */
export interface MetaResult {
  meta: Partial<CanonicalMeta>;
  provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>>;
  /** `CanonicalMeta` field names Polygon's ticker-details/last-trade payloads did not supply. */
  missingFields: (keyof CanonicalMeta)[];
}

function metaProvenance(fetchTimestamp: string): ProvenanceRecord {
  return {
    source: POLYGON_SOURCE,
    tier: POLYGON_TIER,
    asOf: fetchTimestamp,
    periodEnd: null,
    rawUnits: null,
    confidence: POLYGON_CONFIDENCE,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Builds `CanonicalMeta.ticker`, `companyName`, `exchange`, `currency`,
 * `sharesOutstanding`, and `currentPrice` from a ticker-details row and/or a
 * last-trade row (either may be absent - shares/name/exchange/currency come
 * from ticker details, `currentPrice` from the last trade). Fields neither
 * row supplies are reported via `missingFields`, not defaulted or guessed;
 * `fiscalYearEnd` is never in scope here (see `MISSING_FISCAL_YEAR_END` in
 * `polygonAdapter.ts` - Polygon's reference/market-data endpoints carry no
 * fiscal calendar).
 */
export function buildMetaResult(
  ticker: string,
  details: PolygonTickerDetailsResult | null,
  lastTrade: PolygonLastTradeResult | null,
  fetchTimestamp: string,
): MetaResult {
  const meta: Partial<CanonicalMeta> = {};
  const provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>> = {};
  const missingFields: (keyof CanonicalMeta)[] = [];
  const prov = metaProvenance(fetchTimestamp);

  const resolvedTicker = details?.ticker ?? lastTrade?.T ?? ticker;
  meta.ticker = resolvedTicker;
  provenance.ticker = prov;

  const companyName = details?.name ?? null;
  if (isNonEmptyString(companyName)) {
    meta.companyName = companyName;
    provenance.companyName = prov;
  } else {
    missingFields.push("companyName");
  }

  const exchange = details?.primary_exchange ?? null;
  if (isNonEmptyString(exchange)) {
    meta.exchange = exchange;
    provenance.exchange = prov;
  } else {
    missingFields.push("exchange");
  }

  const currency = details?.currency_name ?? null;
  if (isNonEmptyString(currency)) {
    meta.currency = currency.toUpperCase();
    provenance.currency = prov;
  } else {
    missingFields.push("currency");
  }

  const sharesOutstanding = details?.weighted_shares_outstanding ?? details?.share_class_shares_outstanding ?? null;
  if (isFiniteNumber(sharesOutstanding)) {
    meta.sharesOutstanding = sharesOutstanding;
    provenance.sharesOutstanding = prov;
  } else {
    missingFields.push("sharesOutstanding");
  }

  const currentPrice = lastTrade?.p ?? null;
  if (isFiniteNumber(currentPrice)) {
    meta.currentPrice = currentPrice;
    provenance.currentPrice = prov;
  } else {
    missingFields.push("currentPrice");
  }

  meta.fetchTimestamp = fetchTimestamp;
  provenance.fetchTimestamp = prov;

  return { meta, provenance, missingFields };
}
