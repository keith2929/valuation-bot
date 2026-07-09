import type {
  CompanyRef,
  Exchange,
  FinancialStatements,
  MarketData,
  MarketDataProvider,
  PeerData,
} from "@valuation-bot/contract";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import type { WarningsCapableProvider } from "./CachedMarketDataProvider";

interface StaticFinancialsPayload {
  statements: FinancialStatements;
  warnings: string[];
}

/**
 * MarketDataProvider for GitHub Pages: `getFinancials` fetches the precomputed
 * `{statements, warnings}` JSON that `emitStatic.ts` wrote to `public/data/<ticker>.json`
 * (the extraction pipeline can't run in a static host). Everything else --
 * price, peers, beta -- isn't in that JSON, so it delegates to a fixture/live
 * provider, same pattern as `ExtractionProvider`.
 */
export class StaticJsonProvider implements MarketDataProvider, WarningsCapableProvider {
  private readonly delegate: MarketDataProvider;
  private readonly dataUrl: (ticker: string) => string;
  private readonly lastWarnings = new Map<string, string[]>();

  constructor(
    delegate: MarketDataProvider = new FixtureProvider(),
    dataUrl: (ticker: string) => string = (ticker) => `${import.meta.env.BASE_URL}data/${ticker}.json`,
  ) {
    this.delegate = delegate;
    this.dataUrl = dataUrl;
  }

  async getFinancials(id: CompanyRef): Promise<FinancialStatements> {
    const url = this.dataUrl(id.ticker);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`StaticJsonProvider: failed to fetch ${url} (${response.status})`);
    }
    const payload = (await response.json()) as StaticFinancialsPayload;
    this.lastWarnings.set(id.id, payload.warnings);
    return payload.statements;
  }

  /** Warnings from the most recently fetched static JSON for `id`; `[]` if none or not yet fetched. */
  getWarnings(id: CompanyRef): string[] {
    return [...(this.lastWarnings.get(id.id) ?? [])];
  }

  searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef> {
    return this.delegate.searchTicker(ticker, exchange);
  }

  getMarketData(id: CompanyRef): Promise<MarketData> {
    return this.delegate.getMarketData(id);
  }

  getPeer(ticker: string, exchange: Exchange): Promise<PeerData> {
    return this.delegate.getPeer(ticker, exchange);
  }
}
