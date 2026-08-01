/**
 * Shared contract every source adapter (an SGX filing scraper, a vendor API
 * client, ...) implements. An adapter never throws for missing/unavailable
 * fields - `resolveMeta`/`fetchFinancials` return a partial canonical
 * fragment plus per-field provenance and non-fatal `CanonicalError` notes, or
 * the `RateLimited` sentinel when the source itself couldn't be reached.
 */
import type {
  CanonicalError,
  CanonicalFinancials,
  CanonicalMeta,
  ProvenanceMap,
} from "@valuation-bot/canonical";

/** Ranking of how directly a source can be trusted; mirrors `ProvenanceTier` (lower = more authoritative). */
export type AdapterTier = number;

/** Opaque, adapter-defined configuration (API keys, base URLs, feature flags, ...). Each adapter defines its own shape. */
export type AdapterConfig = Record<string, unknown>;

/** Every `CanonicalMeta` field is optional: an adapter only fills in what it actually resolved. */
export type PartialCanonicalMeta = Partial<CanonicalMeta>;

/** Every statement is optional: an adapter may supply any subset of the three core statements. */
export type PartialCanonicalFinancials = Partial<CanonicalFinancials>;

/**
 * One fragment of canonical data returned by a single `resolveMeta` or
 * `fetchFinancials` call: the (partial) data itself, the provenance for each
 * field it filled in, and any non-fatal errors encountered along the way.
 * Never a `CanonicalFinancialData` - merging fragments from multiple sources
 * into one is the orchestrator's job, not the adapter's.
 */
export interface AdapterFragment {
  meta: PartialCanonicalMeta;
  financials: PartialCanonicalFinancials;
  provenance: {
    /** Keyed by `CanonicalMeta` field name, e.g. "currentPrice". */
    meta: ProvenanceMap;
    /** Keyed by `provenanceKey(statement, frequency, periodIndex, tag)`. */
    financials: ProvenanceMap;
  };
  errors: CanonicalError[];
}

/** Builds an empty fragment: nothing resolved, nothing to report. Adapters start from this and fill in what they find. */
export function createEmptyAdapterFragment(): AdapterFragment {
  return {
    meta: {},
    financials: {},
    provenance: { meta: {}, financials: {} },
    errors: [],
  };
}

/**
 * Builds one `CanonicalError`. Adapters call this instead of throwing when a
 * field is missing, malformed, or a downstream call fails - the fragment
 * keeps flowing with the error attached rather than aborting the whole fetch.
 */
export function adapterError(
  source: string,
  message: string,
  options: { code?: string | null; field?: string | null; timestamp?: string } = {},
): CanonicalError {
  return {
    source,
    message,
    code: options.code ?? null,
    field: options.field ?? null,
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Sentinel `resolveMeta`/`fetchFinancials` return when the source itself is
 * rate-limiting requests (e.g. `fetchWithRetry` from `./http` exhausted its
 * retries against repeated 429s). Distinct from `AdapterFragment` so the
 * orchestrator can tell "this source has nothing more to try right now, move
 * to the next one" apart from "this source ran and found some/no data".
 */
export interface RateLimited {
  rateLimited: true;
  source: string;
  /** How long the source asked callers to wait, if it said so (e.g. via `Retry-After`). */
  retryAfterMs: number | null;
}

export function rateLimited(source: string, retryAfterMs: number | null = null): RateLimited {
  return { rateLimited: true, source, retryAfterMs };
}

export function isRateLimited(value: AdapterFragment | RateLimited): value is RateLimited {
  return (value as RateLimited).rateLimited === true;
}

export type ResolveMetaResult = AdapterFragment | RateLimited;
export type FetchFinancialsResult = AdapterFragment | RateLimited;

/**
 * The contract every source adapter implements. `isAvailable` is a cheap,
 * synchronous pre-flight check (e.g. "is an API key present in config?") run
 * before the orchestrator bothers calling the async methods; `resolveMeta`
 * and `fetchFinancials` never throw - see `AdapterFragment` / `RateLimited`.
 */
export interface SourceAdapter<TConfig extends AdapterConfig = AdapterConfig> {
  /** Stable identifier for this source, e.g. "sgx-filing", "vendor:bloomberg". Used as `CanonicalError.source` / `ProvenanceRecord.source`. */
  name: string;
  /** How directly this source can be trusted; mirrors `ProvenanceTier` (lower = more authoritative). */
  tier: AdapterTier;
  /** Whether this adapter has what it needs to run against `config` (e.g. an API key is present). Synchronous, never throws. */
  isAvailable(config: TConfig): boolean;
  /** Resolves company/security identification and point-in-time market facts for `ticker`. */
  resolveMeta(ticker: string): Promise<ResolveMetaResult>;
  /** Fetches as-reported financial statement line items for `ticker`. */
  fetchFinancials(ticker: string): Promise<FetchFinancialsResult>;
}
