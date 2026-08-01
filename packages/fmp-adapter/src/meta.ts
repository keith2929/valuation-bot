/**
 * Normalization of FMP's `/profile` and `/quote` responses into the canonical
 * meta fields this adapter can supply: company name, exchange, currency,
 * shares outstanding, and current price. Pure (rows in, fragment pieces out)
 * so it can be tested without any network; the adapter (`fmpAdapter.ts`) does
 * the fetching.
 */
import type { CanonicalMeta, ProvenanceRecord } from "@valuation-bot/canonical";

import { FMP_CONFIDENCE, FMP_SOURCE, FMP_TIER } from "./config";

/** One row of FMP's `/profile/{symbol}` response (an array with a single element). */
export interface FmpProfileRow {
  symbol?: string;
  companyName?: string;
  currency?: string;
  exchange?: string;
  exchangeShortName?: string;
  price?: number;
  [field: string]: unknown;
}

/** One row of FMP's `/quote/{symbol}` response (an array with a single element). */
export interface FmpQuoteRow {
  symbol?: string;
  name?: string;
  price?: number;
  sharesOutstanding?: number;
  [field: string]: unknown;
}

/** Result of normalizing profile + quote: the partial meta fields resolved, their provenance, and which fields could not be filled. */
export interface MetaResult {
  meta: Partial<CanonicalMeta>;
  provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>>;
  /** `CanonicalMeta` field names FMP's profile/quote payloads did not supply. */
  missingFields: (keyof CanonicalMeta)[];
}

function metaProvenance(fetchTimestamp: string): ProvenanceRecord {
  return {
    source: FMP_SOURCE,
    tier: FMP_TIER,
    asOf: fetchTimestamp,
    periodEnd: null,
    rawUnits: null,
    confidence: FMP_CONFIDENCE,
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
 * `sharesOutstanding`, and `currentPrice` from a profile row and/or a quote
 * row (either may be absent - each field is filled from whichever row
 * supplies it, quote preferred for the two live-market fields). Fields
 * neither row supplies are reported via `missingFields`, not defaulted or
 * guessed; `fiscalYearEnd` is never in scope here (see `MISSING_FISCAL_YEAR_END` in `fmpAdapter.ts`).
 */
export function buildMetaResult(
  ticker: string,
  profile: FmpProfileRow | null,
  quote: FmpQuoteRow | null,
  fetchTimestamp: string,
): MetaResult {
  const meta: Partial<CanonicalMeta> = {};
  const provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>> = {};
  const missingFields: (keyof CanonicalMeta)[] = [];
  const prov = metaProvenance(fetchTimestamp);

  const resolvedTicker = profile?.symbol ?? quote?.symbol ?? ticker;
  meta.ticker = resolvedTicker;
  provenance.ticker = prov;

  const companyName = profile?.companyName ?? quote?.name ?? null;
  if (isNonEmptyString(companyName)) {
    meta.companyName = companyName;
    provenance.companyName = prov;
  } else {
    missingFields.push("companyName");
  }

  const exchange = profile?.exchangeShortName ?? profile?.exchange ?? null;
  if (isNonEmptyString(exchange)) {
    meta.exchange = exchange;
    provenance.exchange = prov;
  } else {
    missingFields.push("exchange");
  }

  const currency = profile?.currency ?? null;
  if (isNonEmptyString(currency)) {
    meta.currency = currency;
    provenance.currency = prov;
  } else {
    missingFields.push("currency");
  }

  const sharesOutstanding = quote?.sharesOutstanding ?? null;
  if (isFiniteNumber(sharesOutstanding)) {
    meta.sharesOutstanding = sharesOutstanding;
    provenance.sharesOutstanding = prov;
  } else {
    missingFields.push("sharesOutstanding");
  }

  const currentPrice = quote?.price ?? profile?.price ?? null;
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
