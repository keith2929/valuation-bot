/**
 * Ticker resolution + source selection: given a raw ticker, determine its
 * market and return the ordered list of `SourceAdapter`s eligible to fetch
 * it, per that market's descriptor. This is the only place market/source
 * routing decisions are made - adapters and descriptors themselves stay
 * unaware of each other.
 */
import type { AdapterConfig, SourceAdapter } from "@valuation-bot/source-adapter";

import { resolveMarket, type MarketDescriptor } from "./marketDescriptor";
import { DEFAULT_MARKET_DESCRIPTORS } from "./markets";

/** Result of resolving a raw ticker: its market and the normalized symbol to hand to adapters. */
export interface TickerResolution {
  /** The raw ticker exactly as supplied by the caller. */
  rawTicker: string;
  /** Symbol with any market suffix stripped and case-normalized, e.g. "OCBC/SGX" -> "OCBC". */
  normalizedTicker: string;
  market: MarketDescriptor;
}

/**
 * Determines which market `rawTicker` belongs to and normalizes it to the
 * bare symbol adapters expect. Throws `UnresolvedMarketError` (from
 * `./marketDescriptor`) if no descriptor claims the ticker.
 */
export function resolveTicker(
  rawTicker: string,
  descriptors: MarketDescriptor[] = DEFAULT_MARKET_DESCRIPTORS,
): TickerResolution {
  const market = resolveMarket(rawTicker, descriptors);
  return {
    rawTicker,
    normalizedTicker: market.normalize(rawTicker),
    market,
  };
}

/**
 * Orders `adapters` per `market.sourceOrder` (most-preferred first).
 * Adapters whose name isn't listed for this market are dropped; names listed
 * but missing from `adapters` are simply skipped, so a caller can supply
 * only whichever adapters happen to be wired up at runtime.
 */
export function selectSourcesForMarket<TConfig extends AdapterConfig>(
  market: MarketDescriptor,
  adapters: SourceAdapter<TConfig>[],
): SourceAdapter<TConfig>[] {
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  const ordered: SourceAdapter<TConfig>[] = [];
  for (const name of market.sourceOrder) {
    const adapter = byName.get(name);
    if (adapter) {
      ordered.push(adapter);
    }
  }
  return ordered;
}

/**
 * Convenience wrapper combining `resolveTicker` + `selectSourcesForMarket`:
 * given a raw ticker and the full set of registered adapters, returns the
 * resolution plus the ordered, market-eligible subset of `adapters`.
 */
export function resolveTickerSources<TConfig extends AdapterConfig>(
  rawTicker: string,
  adapters: SourceAdapter<TConfig>[],
  descriptors: MarketDescriptor[] = DEFAULT_MARKET_DESCRIPTORS,
): TickerResolution & { sources: SourceAdapter<TConfig>[] } {
  const resolution = resolveTicker(rawTicker, descriptors);
  return {
    ...resolution,
    sources: selectSourcesForMarket(resolution.market, adapters),
  };
}
