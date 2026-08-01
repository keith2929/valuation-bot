/**
 * Data-driven description of one market/exchange: how to recognize a raw
 * ticker as belonging to it, how to normalize that ticker to the bare symbol
 * a source adapter expects, and which source adapters (by name, most
 * preferred first) are eligible for it. Adding a market is adding one
 * `MarketDescriptor` - it never requires touching the canonical schema, the
 * `SourceAdapter` contract, or the resolver logic below.
 */

/**
 * One market/exchange definition. `sourceOrder` is a list of
 * `SourceAdapter.name` values, ordered most-authoritative-first (e.g. a
 * regulatory filing source before a vendor API, a vendor API before an HTML
 * scraper). Names not present in the caller's adapter registry are simply
 * skipped by the resolver - a descriptor does not need to know which
 * adapters are actually wired up at runtime.
 */
export interface MarketDescriptor {
  /** Stable identifier for this market, e.g. "US", "SGX". */
  id: string;
  /** Human-readable name, e.g. "United States", "Singapore Exchange". */
  label: string;
  /** Value to populate `CanonicalMeta.exchange` with when this market is resolved. */
  exchange: string;
  /** Returns true if `rawTicker` belongs to this market. Checked in descriptor list order. */
  matches(rawTicker: string): boolean;
  /** Strips any market suffix/prefix and returns the bare symbol a source adapter expects. */
  normalize(rawTicker: string): string;
  /** `SourceAdapter.name` values eligible for this market, most-preferred first. */
  sourceOrder: string[];
}

/** Thrown by `resolveMarket` when no descriptor in the list claims a ticker. */
export class UnresolvedMarketError extends Error {
  readonly ticker: string;

  constructor(ticker: string) {
    super(`No market descriptor matches ticker "${ticker}"`);
    this.name = "UnresolvedMarketError";
    this.ticker = ticker;
  }
}

/**
 * Finds the first descriptor (in list order) whose `matches` accepts
 * `rawTicker`. Order matters: put more specific/narrow descriptors before
 * broad catch-alls.
 */
export function resolveMarket(rawTicker: string, descriptors: MarketDescriptor[]): MarketDescriptor {
  const market = descriptors.find((descriptor) => descriptor.matches(rawTicker));
  if (!market) {
    throw new UnresolvedMarketError(rawTicker);
  }
  return market;
}
