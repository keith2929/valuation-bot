/**
 * Normalization of Alpha Vantage's `OVERVIEW` and `GLOBAL_QUOTE` responses
 * into the canonical meta fields this adapter can supply: company name,
 * exchange, currency, shares outstanding, and current price. Pure (rows in,
 * fragment pieces out) so it can be tested without any network; the adapter
 * (`alphaVantageAdapter.ts`) does the fetching.
 */
import type { CanonicalMeta, ProvenanceRecord } from "@valuation-bot/canonical";

import { ALPHA_VANTAGE_CONFIDENCE, ALPHA_VANTAGE_SOURCE, ALPHA_VANTAGE_TIER } from "./config";

/**
 * Alpha Vantage's `OVERVIEW` response: a single JSON object (not an array)
 * of mostly-string fields. `FiscalYearEnd` is only ever a month name (e.g.
 * `"December"`), never a full date, so it cannot fill `CanonicalMeta.fiscalYearEnd`.
 */
export interface AlphaVantageOverview {
  Symbol?: string;
  Name?: string;
  Exchange?: string;
  Currency?: string;
  FiscalYearEnd?: string;
  SharesOutstanding?: string;
  [field: string]: unknown;
}

/** The object nested under Alpha Vantage's `"Global Quote"` key in a `GLOBAL_QUOTE` response. */
export interface AlphaVantageGlobalQuote {
  "01. symbol"?: string;
  "05. price"?: string;
  [field: string]: unknown;
}

/** Result of normalizing overview + quote: the partial meta fields resolved, their provenance, and which fields could not be filled. */
export interface MetaResult {
  meta: Partial<CanonicalMeta>;
  provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>>;
  /** `CanonicalMeta` field names Alpha Vantage's overview/quote payloads did not supply. */
  missingFields: (keyof CanonicalMeta)[];
}

function metaProvenance(fetchTimestamp: string): ProvenanceRecord {
  return {
    source: ALPHA_VANTAGE_SOURCE,
    tier: ALPHA_VANTAGE_TIER,
    asOf: fetchTimestamp,
    periodEnd: null,
    rawUnits: null,
    confidence: ALPHA_VANTAGE_CONFIDENCE,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Alpha Vantage reports numeric meta fields (shares outstanding, price) as strings, using `"None"`/`"-"` for absent values. */
function parseNumericString(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "None" || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Builds `CanonicalMeta.ticker`, `companyName`, `exchange`, `currency`,
 * `sharesOutstanding`, and `currentPrice` from an `OVERVIEW` row and/or a
 * `GLOBAL_QUOTE` row (either may be absent). `currentPrice` comes from the
 * live quote only - `OVERVIEW` carries no price field. Fields neither row
 * supplies are reported via `missingFields`, not defaulted or guessed;
 * `fiscalYearEnd` is never in scope here (see `MISSING_FISCAL_YEAR_END` in
 * `alphaVantageAdapter.ts` - `OVERVIEW.FiscalYearEnd` is only a month name).
 */
export function buildMetaResult(
  ticker: string,
  overview: AlphaVantageOverview | null,
  quote: AlphaVantageGlobalQuote | null,
  fetchTimestamp: string,
): MetaResult {
  const meta: Partial<CanonicalMeta> = {};
  const provenance: Partial<Record<keyof CanonicalMeta, ProvenanceRecord>> = {};
  const missingFields: (keyof CanonicalMeta)[] = [];
  const prov = metaProvenance(fetchTimestamp);

  const resolvedTicker = overview?.Symbol ?? quote?.["01. symbol"] ?? ticker;
  meta.ticker = resolvedTicker;
  provenance.ticker = prov;

  const companyName = overview?.Name ?? null;
  if (isNonEmptyString(companyName)) {
    meta.companyName = companyName;
    provenance.companyName = prov;
  } else {
    missingFields.push("companyName");
  }

  const exchange = overview?.Exchange ?? null;
  if (isNonEmptyString(exchange)) {
    meta.exchange = exchange;
    provenance.exchange = prov;
  } else {
    missingFields.push("exchange");
  }

  const currency = overview?.Currency ?? null;
  if (isNonEmptyString(currency)) {
    meta.currency = currency;
    provenance.currency = prov;
  } else {
    missingFields.push("currency");
  }

  const sharesOutstanding = parseNumericString(overview?.SharesOutstanding);
  if (sharesOutstanding !== null) {
    meta.sharesOutstanding = sharesOutstanding;
    provenance.sharesOutstanding = prov;
  } else {
    missingFields.push("sharesOutstanding");
  }

  const currentPrice = parseNumericString(quote?.["05. price"]);
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
