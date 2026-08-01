/**
 * Canonical output contract for a market-data fetch pipeline: the shape
 * returned by `fetchFinancials(ticker)` for any exchange/market. This module
 * is deliberately dependency-free and contains no derived metrics (no
 * margins, multiples, growth rates, or per-share figures) - only raw,
 * as-reported values plus the provenance needed to trust them.
 */

/** ISO 4217 currency code, e.g. "SGD", "USD", "JPY". */
export type CurrencyCode = string;

/** ISO 8601 date string, e.g. "2025-12-31". */
export type IsoDate = string;

/** ISO 8601 date-time string, e.g. "2026-07-31T09:15:00Z". */
export type IsoDateTime = string;

/**
 * The scale a raw figure was reported in, as stated by the source (e.g. a
 * filing reported "in thousands"). Left as an open string union plus a
 * fallback `string` so unusual source conventions aren't forced into a
 * fixed enum.
 */
export type ReportedUnits = "ones" | "thousands" | "millions" | "billions" | string;

/** How often a period series is reported. */
export type PeriodFrequency = "annual" | "quarterly" | "ltm";

/**
 * A single raw data point as reported by a source, before any unit or
 * currency normalization. `raw` is the number exactly as sourced; `units`
 * and `currency` record how to interpret it; `periodEnd` is the date the
 * value pertains to (which may differ from the fetch/as-of date recorded in
 * provenance).
 */
export interface CanonicalValue {
  raw: number | null;
  units: ReportedUnits | null;
  currency: CurrencyCode | null;
  periodEnd: IsoDate | null;
}

/**
 * One reported line item within a statement period. `tag` is a canonical
 * identifier for cross-market mapping (e.g. "revenue", "netIncome"); it is
 * null when a source line item doesn't map to any known canonical concept,
 * so unmapped/market-specific captions are preserved rather than dropped.
 * `label` is the caption as the source actually printed it.
 */
export interface CanonicalLineItem {
  tag: string | null;
  label: string;
  value: CanonicalValue;
}

/** All line items reported for a single statement period (one fiscal year, quarter, or the LTM window). */
export type CanonicalStatementPeriod = CanonicalLineItem[];

/**
 * A single financial statement (income statement, balance sheet, or cash
 * flow) across all periods a source provided. `annual` and `quarterly` are
 * ordered oldest -> newest; annual is expected to hold 5-10 fiscal years
 * where available. `ltm` is the trailing-twelve-month period, if the source
 * supplies or supports deriving one; otherwise null.
 */
export interface CanonicalStatement {
  annual: CanonicalStatementPeriod[];
  quarterly: CanonicalStatementPeriod[];
  ltm: CanonicalStatementPeriod | null;
}

/** Raw line items for all three core statements. No derived/combined statements. */
export interface CanonicalFinancials {
  incomeStatement: CanonicalStatement;
  balanceSheet: CanonicalStatement;
  cashFlow: CanonicalStatement;
}

/**
 * Company/security identification and point-in-time market facts. Deliberately
 * market-agnostic: `exchange` is a free-form code (not restricted to US
 * exchanges), and `fiscalYearEnd` is a date rather than assuming a calendar
 * year-end.
 */
export interface CanonicalMeta {
  ticker: string | null;
  companyName: string | null;
  /** Exchange or market identifier, e.g. "SGX", "NYSE", "SEHK", "TSE". Free-form - not a fixed enum. */
  exchange: string | null;
  /** Reporting currency of the underlying financial statements. */
  currency: CurrencyCode | null;
  /** Most recent fiscal year-end date; not assumed to be Dec 31. */
  fiscalYearEnd: IsoDate | null;
  sharesOutstanding: number | null;
  currentPrice: number | null;
  /** When this canonical record was assembled, regardless of any individual field's own as-of date. */
  fetchTimestamp: IsoDateTime | null;
}

/**
 * Ranking of how directly a source can be trusted (lower tier = more
 * authoritative), e.g. 1 = primary filing/regulatory source, 2 = licensed
 * market-data vendor, 3 = secondary/aggregator, 4 = inferred or best-effort.
 * Left as a number rather than a fixed enum so pipelines can define their
 * own tier ladder.
 */
export type ProvenanceTier = number;

/** Where one field's value came from, and how much to trust it. */
export interface ProvenanceRecord {
  /** Name/identifier of the source that produced the value, e.g. "SGX filing", "vendor:bloomberg". */
  source: string;
  tier: ProvenanceTier;
  /** When the source's data was current as of, or when it was fetched - whichever the source exposes. */
  asOf: IsoDateTime | null;
  /** The reporting period this value pertains to, if different from `asOf`. */
  periodEnd: IsoDate | null;
  /** Units the source reported the value in, before any normalization. */
  rawUnits: ReportedUnits | null;
  /** Confidence score in [0, 1]; null if the source/pipeline does not produce one. */
  confidence: number | null;
}

/**
 * Provenance is keyed by field path, not nested to mirror `financials`/`meta`
 * exactly, since a single line item's provenance key must also encode which
 * statement, frequency, period index, and tag it belongs to. Callers should
 * use `provenanceKey()` (below) to build/parse keys consistently.
 */
export type ProvenanceMap = Record<string, ProvenanceRecord>;

export interface CanonicalProvenance {
  /** Keyed by `CanonicalMeta` field name, e.g. "currentPrice". */
  meta: ProvenanceMap;
  /** Keyed by `provenanceKey(statement, frequency, periodIndex, tag)`. */
  financials: ProvenanceMap;
}

/**
 * Builds the provenance-map key for one financials data point. Kept as a
 * single shared helper so producers and consumers of `CanonicalProvenance`
 * never disagree on key formatting.
 */
export function provenanceKey(
  statement: keyof CanonicalFinancials,
  frequency: PeriodFrequency,
  periodIndex: number,
  tag: string,
): string {
  return `${statement}.${frequency}.${periodIndex}.${tag}`;
}

/** A non-fatal error surfaced by one source/step of the fetch pipeline; fetching continues around it. */
export interface CanonicalError {
  source: string;
  message: string;
  code: string | null;
  timestamp: IsoDateTime;
  /** Field path (e.g. a `provenanceKey()` result, or a `CanonicalMeta` field name) this error relates to, if any. */
  field: string | null;
}

/** The full return shape of `fetchFinancials(ticker)`. */
export interface CanonicalFinancialData {
  meta: CanonicalMeta;
  financials: CanonicalFinancials;
  provenance: CanonicalProvenance;
  errors: CanonicalError[];
}

/** Signature implementations of the fetch pipeline's entry point must satisfy. */
export type FetchFinancials = (ticker: string) => Promise<CanonicalFinancialData>;

function createEmptyStatement(): CanonicalStatement {
  return { annual: [], quarterly: [], ltm: null };
}

function createEmptyMeta(): CanonicalMeta {
  return {
    ticker: null,
    companyName: null,
    exchange: null,
    currency: null,
    fiscalYearEnd: null,
    sharesOutstanding: null,
    currentPrice: null,
    fetchTimestamp: null,
  };
}

function createEmptyFinancials(): CanonicalFinancials {
  return {
    incomeStatement: createEmptyStatement(),
    balanceSheet: createEmptyStatement(),
    cashFlow: createEmptyStatement(),
  };
}

function createEmptyProvenance(): CanonicalProvenance {
  return { meta: {}, financials: {} };
}

/**
 * Builds an empty `CanonicalFinancialData`: every scalar field is null, every
 * period/line-item array is empty, and `errors`/provenance maps start empty.
 * Intended as the base callers fill in incrementally as each source
 * responds, and as the fixture for "no data available" states.
 */
export function createEmptyCanonicalFinancialData(): CanonicalFinancialData {
  return {
    meta: createEmptyMeta(),
    financials: createEmptyFinancials(),
    provenance: createEmptyProvenance(),
    errors: [],
  };
}
