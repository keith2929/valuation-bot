import type {
  CompanyRef,
  Exchange,
  FinancialStatements,
  MarketData,
  MarketDataProvider,
  PeerData,
} from "@valuation-bot/contract";
import { ResponseCache } from "./ResponseCache";

/**
 * Decorates any MarketDataProvider (FixtureProvider, ExtractionProvider, or a
 * future live API) with a per-session ResponseCache. Core never knows this
 * wrapper exists -- swapping the underlying data source is purely an app-level
 * concern, done by constructing a different delegate here.
 */
export class CachedMarketDataProvider implements MarketDataProvider {
  private readonly delegate: MarketDataProvider;
  private readonly cache: ResponseCache;

  constructor(delegate: MarketDataProvider, cache: ResponseCache = new ResponseCache()) {
    this.delegate = delegate;
    this.cache = cache;
  }

  searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef> {
    return this.cache.getOrFetch(tickerKey(ticker, exchange), "searchTicker", () =>
      this.delegate.searchTicker(ticker, exchange),
    );
  }

  getFinancials(id: CompanyRef): Promise<FinancialStatements> {
    return this.cache.getOrFetch(id.id, "getFinancials", () => this.delegate.getFinancials(id));
  }

  getMarketData(id: CompanyRef): Promise<MarketData> {
    return this.cache.getOrFetch(id.id, "getMarketData", () => this.delegate.getMarketData(id));
  }

  getPeer(ticker: string, exchange: Exchange): Promise<PeerData> {
    return this.cache.getOrFetch(tickerKey(ticker, exchange), "getPeer", () =>
      this.delegate.getPeer(ticker, exchange),
    );
  }

  /**
   * Forwards to the delegate's `getWarnings` (e.g. `ExtractionProvider`) when
   * it has one, so wrapping in this cache doesn't hide adapter/extraction
   * warnings from the UI. Returns `[]` for delegates without warnings (e.g.
   * `FixtureProvider`).
   */
  getWarnings(id: CompanyRef): string[] {
    const delegate = this.delegate as Partial<WarningsCapableProvider>;
    return delegate.getWarnings ? delegate.getWarnings(id) : [];
  }
}

/** Duck-typed capability implemented by `ExtractionProvider` (and this class). */
export interface WarningsCapableProvider {
  getWarnings(id: CompanyRef): string[];
}

function tickerKey(ticker: string, exchange: Exchange): string {
  return `${exchange}:${ticker.toUpperCase()}`;
}
