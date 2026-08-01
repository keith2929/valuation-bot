/**
 * The orchestration loop and the pipeline's public entry point.
 *
 * `fetchFinancials(ticker)` ties the whole pipeline together: it asks the
 * ticker resolver which market the ticker belongs to and which source adapters
 * are eligible, runs those adapters in tier order (most-authoritative first),
 * feeds every fragment they produce into the merge engine, and returns one
 * assembled `CanonicalFinancialData`.
 *
 * Robustness is the whole point of this layer. It NEVER throws: an unresolved
 * market, an unavailable source, a rate-limit sentinel, or even an adapter
 * that breaks its own contract and throws are all caught, recorded as
 * non-fatal `CanonicalError` notes, and stepped over so the remaining sources
 * still contribute. A partial result always beats an exception.
 */
import {
  createEmptyCanonicalFinancialData,
  type CanonicalError,
  type CanonicalFinancialData,
  type IsoDateTime,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";
import {
  createEmptyAdapterFragment,
  isRateLimited,
  type AdapterConfig,
  type AdapterFragment,
  type RateLimited,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";
import {
  resolveTickerSources,
  type MarketDescriptor,
  type TickerResolution,
} from "@valuation-bot/ticker-resolver";
import { mergeFragments } from "@valuation-bot/merge-engine";

import { ORCHESTRATOR_MARKET_DESCRIPTORS } from "./descriptors";
import {
  createDefaultAdapters,
  type AdapterRegistration,
  type OrchestratorConfig,
} from "./registry";

/** `CanonicalError.source` / `ProvenanceRecord.source` for notes the orchestrator itself raises. */
export const ORCHESTRATOR_SOURCE = "orchestrator";

/** No market descriptor claimed the ticker; nothing could be routed. */
export const UNRESOLVED_MARKET_CODE = "UNRESOLVED_MARKET";
/** The ticker resolved to a market, but no eligible adapter was registered/available for it. */
export const NO_ELIGIBLE_SOURCES_CODE = "NO_ELIGIBLE_SOURCES";
/** A registered adapter reported `isAvailable === false` (e.g. missing API key) and was skipped. */
export const SOURCE_UNAVAILABLE_CODE = "SOURCE_UNAVAILABLE";
/** A source rate-limited the request; the adapter was skipped for this fetch. */
export const SOURCE_RATE_LIMITED_CODE = "SOURCE_RATE_LIMITED";
/** An adapter threw despite the never-throw contract; the orchestrator absorbed it and moved on. */
export const SOURCE_FAILED_CODE = "SOURCE_FAILED";

/** Options for {@link fetchFinancials}. All optional; the defaults build the full source registry from `process.env`. */
export interface FetchFinancialsOptions {
  /**
   * Explicit adapter registry to run against. Defaults to
   * `createDefaultAdapters(config)`. Supplying this (typically with fakes) is
   * how tests drive the loop without any network or credentials.
   */
  adapters?: AdapterRegistration[];
  /** Per-source configuration used to build the default registry when `adapters` is omitted. */
  config?: OrchestratorConfig;
  /** Market descriptors handed to the resolver. Defaults to {@link ORCHESTRATOR_MARKET_DESCRIPTORS} (real adapter names). */
  descriptors?: MarketDescriptor[];
  /**
   * Fixed assembly timestamp, threaded into the merge engine and every error
   * note. Defaults to `new Date().toISOString()`; pass a constant to make a
   * whole fetch deterministic in tests.
   */
  now?: IsoDateTime;
}

/** Builds one orchestrator-sourced `CanonicalError`. */
function orchestratorError(
  message: string,
  code: string,
  now: IsoDateTime,
  field: string | null = null,
): CanonicalError {
  return { source: ORCHESTRATOR_SOURCE, message, code, timestamp: now, field };
}

/**
 * Runs one adapter's two fetch methods and folds their outcomes into
 * fragments + per-source error notes. `resolveMeta` and `fetchFinancials` are
 * independent, so they run concurrently; each result is handled on its own -
 * one being rate-limited or throwing never discards the other. Never throws.
 */
async function runAdapter(
  adapter: SourceAdapter<AdapterConfig>,
  ticker: string,
  now: IsoDateTime,
): Promise<{ fragments: AdapterFragment[]; errors: CanonicalError[] }> {
  const fragments: AdapterFragment[] = [];
  const errors: CanonicalError[] = [];

  const handle = async (method: "resolveMeta" | "fetchFinancials"): Promise<void> => {
    let result: AdapterFragment | RateLimited;
    try {
      result = await adapter[method](ticker);
    } catch (error) {
      // The contract says adapters never throw; if one does anyway, absorb it
      // as a non-fatal note rather than letting it abort the whole fetch.
      errors.push(
        orchestratorError(
          `Source "${adapter.name}" threw from ${method}: ${describeError(error)}`,
          SOURCE_FAILED_CODE,
          now,
        ),
      );
      return;
    }

    if (isRateLimited(result)) {
      const waited = result.retryAfterMs === null ? "" : ` (retry after ${result.retryAfterMs}ms)`;
      errors.push(
        orchestratorError(
          `Source "${adapter.name}" rate-limited ${method}${waited}; skipped.`,
          SOURCE_RATE_LIMITED_CODE,
          now,
        ),
      );
      return;
    }

    fragments.push(result);
  };

  // resolveMeta first, fetchFinancials second: keeps fragment order stable and
  // matches the "identify, then fetch" reading order.
  await Promise.all([handle("resolveMeta"), handle("fetchFinancials")]);
  return { fragments, errors };
}

/** Runs only an adapter's inexpensive identity lookup for ticker search. */
async function runAdapterMeta(
  adapter: SourceAdapter<AdapterConfig>,
  ticker: string,
  now: IsoDateTime,
): Promise<{ fragments: AdapterFragment[]; errors: CanonicalError[] }> {
  try {
    const result = await adapter.resolveMeta(ticker);
    if (isRateLimited(result)) {
      const waited = result.retryAfterMs === null ? "" : ` (retry after ${result.retryAfterMs}ms)`;
      return { fragments: [], errors: [orchestratorError(`Source "${adapter.name}" rate-limited resolveMeta${waited}; skipped.`, SOURCE_RATE_LIMITED_CODE, now)] };
    }
    return { fragments: [result], errors: [] };
  } catch (error) {
    return { fragments: [], errors: [orchestratorError(`Source "${adapter.name}" threw from resolveMeta: ${describeError(error)}`, SOURCE_FAILED_CODE, now)] };
  }
}

/** Turns any thrown value into a short, safe description for an error note. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Builds the lowest-priority "identity" fragment carrying the market's
 * exchange code and the normalized ticker. Appended last so any real data
 * source overrides it, but present so `meta.exchange` / `meta.ticker` are
 * populated from routing when no source supplies them - which also suppresses
 * the merge engine's `FIELD_UNFILLED` note for those two fields.
 */
function resolverIdentityFragment(resolution: TickerResolution, now: IsoDateTime): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  fragment.meta = { exchange: resolution.market.exchange, ticker: resolution.normalizedTicker };
  const record: ProvenanceRecord = {
    source: ORCHESTRATOR_SOURCE,
    tier: 0,
    asOf: now,
    periodEnd: null,
    rawUnits: null,
    confidence: 1,
  };
  fragment.provenance.meta = { exchange: record, ticker: record };
  return fragment;
}

/** Calls `isAvailable` defensively - a pre-flight that throws must not abort the loop. */
function safeIsAvailable(registration: AdapterRegistration): boolean {
  try {
    return registration.adapter.isAvailable(registration.config);
  } catch {
    return false;
  }
}

/**
 * The pipeline's public entry point. Resolves `ticker` to a market, runs the
 * eligible source adapters in tier order, merges their fragments, and returns
 * the assembled canonical record: `{ meta, financials, provenance, errors }`.
 * Never throws - every failure path is recorded in `errors` and the best
 * available partial result is returned.
 */
export async function fetchFinancials(
  ticker: string,
  options: FetchFinancialsOptions = {},
): Promise<CanonicalFinancialData> {
  const now = options.now ?? new Date().toISOString();
  const registrations = options.adapters ?? createDefaultAdapters(options.config);
  const descriptors = options.descriptors ?? ORCHESTRATOR_MARKET_DESCRIPTORS;

  // 1. Route the ticker to a market and its ordered, eligible adapters. An
  //    unresolvable market is non-fatal: return an empty record with a note.
  let resolution: TickerResolution & { sources: SourceAdapter<AdapterConfig>[] };
  try {
    const adapters = registrations.map((registration) => registration.adapter);
    resolution = resolveTickerSources(ticker, adapters, descriptors);
  } catch (error) {
    const empty = createEmptyCanonicalFinancialData();
    empty.meta.ticker = ticker;
    empty.meta.fetchTimestamp = now;
    empty.errors = [orchestratorError(describeError(error), UNRESOLVED_MARKET_CODE, now)];
    return empty;
  }

  // Recover each selected adapter's config so `isAvailable` can be re-checked
  // against the exact config the adapter was constructed with.
  const registrationByAdapter = new Map(
    registrations.map((registration) => [registration.adapter, registration]),
  );

  // 2. Run strictly in ascending tier order (most authoritative first). The
  //    resolver already orders by the descriptor's sourceOrder; this re-sort
  //    is the contract's "tier order" made explicit and settles same-slot ties.
  const ordered = [...resolution.sources].sort((a, b) => a.tier - b.tier);

  const fragments: AdapterFragment[] = [];
  const errors: CanonicalError[] = [];

  if (ordered.length === 0) {
    errors.push(
      orchestratorError(
        `No source adapter is registered for market "${resolution.market.id}".`,
        NO_ELIGIBLE_SOURCES_CODE,
        now,
      ),
    );
  }

  // 3. Loop the adapters in tier order, skipping-and-recording unavailable or
  //    rate-limited sources, collecting fragments from the rest.
  for (const adapter of ordered) {
    const registration = registrationByAdapter.get(adapter);
    if (registration === undefined || !safeIsAvailable(registration)) {
      errors.push(
        orchestratorError(
          `Source "${adapter.name}" is unavailable (missing credentials/config); skipped.`,
          SOURCE_UNAVAILABLE_CODE,
          now,
        ),
      );
      continue;
    }

    const outcome = await runAdapter(adapter, resolution.normalizedTicker, now);
    fragments.push(...outcome.fragments);
    errors.push(...outcome.errors);
  }

  // 4. Append the routing-derived identity fragment last (lowest priority).
  fragments.push(resolverIdentityFragment(resolution, now));

  // 5. Merge (fragments are already highest-priority-first) and combine the
  //    merge's own notes with the per-source notes gathered above.
  const merged = mergeFragments(fragments, { now });
  return {
    meta: merged.meta,
    financials: merged.financials,
    provenance: merged.provenance,
    errors: [...merged.errors, ...errors],
  };
}

/** Resolves company identity only; unlike `fetchFinancials`, never downloads statement data. */
export async function resolveCompanyMeta(
  ticker: string,
  options: FetchFinancialsOptions = {},
): Promise<CanonicalFinancialData> {
  const now = options.now ?? new Date().toISOString();
  const registrations = options.adapters ?? createDefaultAdapters(options.config);
  const descriptors = options.descriptors ?? ORCHESTRATOR_MARKET_DESCRIPTORS;
  let resolution: TickerResolution & { sources: SourceAdapter<AdapterConfig>[] };
  try {
    resolution = resolveTickerSources(ticker, registrations.map((registration) => registration.adapter), descriptors);
  } catch (error) {
    const empty = createEmptyCanonicalFinancialData();
    empty.meta.ticker = ticker;
    empty.meta.fetchTimestamp = now;
    empty.errors = [orchestratorError(describeError(error), UNRESOLVED_MARKET_CODE, now)];
    return empty;
  }

  const registrationByAdapter = new Map(registrations.map((registration) => [registration.adapter, registration]));
  const ordered = [...resolution.sources].sort((a, b) => a.tier - b.tier);
  const fragments: AdapterFragment[] = [];
  const errors: CanonicalError[] = [];
  if (ordered.length === 0) {
    errors.push(orchestratorError(`No source adapter is registered for market "${resolution.market.id}".`, NO_ELIGIBLE_SOURCES_CODE, now));
  }
  for (const adapter of ordered) {
    const registration = registrationByAdapter.get(adapter);
    if (registration === undefined || !safeIsAvailable(registration)) {
      errors.push(orchestratorError(`Source "${adapter.name}" is unavailable (missing credentials/config); skipped.`, SOURCE_UNAVAILABLE_CODE, now));
      continue;
    }
    const outcome = await runAdapterMeta(adapter, resolution.normalizedTicker, now);
    fragments.push(...outcome.fragments);
    errors.push(...outcome.errors);
  }
  fragments.push(resolverIdentityFragment(resolution, now));
  const merged = mergeFragments(fragments, { now });
  return { meta: merged.meta, financials: merged.financials, provenance: merged.provenance, errors: [...merged.errors, ...errors] };
}
