import type {
  CompanyRef,
  Exchange,
  ExtractionResult,
  FinancialStatements,
  MarketData,
  MarketDataProvider,
  PeerData,
} from "@valuation-bot/contract";
import { toFinancialStatements } from "@valuation-bot/adapter";
import { FixtureProvider } from "./FixtureProvider";

/** Where an {@link ExtractionProvider} looks up the stored `ExtractionResult[]` for one company. */
export interface ExtractionResultStore {
  list(id: CompanyRef): ExtractionResult[] | Promise<ExtractionResult[]>;
}

/** In-memory {@link ExtractionResultStore}; entries are lost when the process exits. */
export class InMemoryExtractionResultStore implements ExtractionResultStore {
  private readonly byCompanyId = new Map<string, ExtractionResult[]>();

  set(id: CompanyRef, results: ExtractionResult[]): void {
    this.byCompanyId.set(id.id, [...results]);
  }

  list(id: CompanyRef): ExtractionResult[] {
    return [...(this.byCompanyId.get(id.id) ?? [])];
  }
}

/**
 * MarketDataProvider backed by Bot 1's extraction output (Part 3 of the spec).
 * `getFinancials` loads the stored `ExtractionResult[]` for a company and runs
 * them through `@valuation-bot/adapter` to assemble a multi-year
 * `FinancialStatements`.
 *
 * `searchTicker`, `getMarketData`, and `getPeer` cannot be sourced from annual
 * reports — price, shares outstanding, 52-week range, peer fundamentals, and
 * 5-year beta never appear in extracted statements — so they delegate to the
 * fixture/stub provider until a live market-data API exists.
 */
export class ExtractionProvider implements MarketDataProvider {
  private readonly store: ExtractionResultStore;
  private readonly marketDataDelegate: MarketDataProvider;
  private readonly lastWarnings = new Map<string, string[]>();

  constructor(
    store: ExtractionResultStore = new InMemoryExtractionResultStore(),
    marketDataDelegate: MarketDataProvider = new FixtureProvider(),
  ) {
    this.store = store;
    this.marketDataDelegate = marketDataDelegate;
  }

  async getFinancials(id: CompanyRef): Promise<FinancialStatements> {
    const reports = await this.store.list(id);
    if (reports.length === 0) {
      throw new Error(`ExtractionProvider: no stored extraction results for company id '${id.id}'`);
    }
    const { statements, warnings } = toFinancialStatements(reports);
    this.lastWarnings.set(id.id, warnings);
    return statements;
  }

  /** Adapter warnings from the most recent `getFinancials` call for `id`; the UI flags anything non-empty. */
  getWarnings(id: CompanyRef): string[] {
    return [...(this.lastWarnings.get(id.id) ?? [])];
  }

  // STUB: future market-data API
  async searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef> {
    return this.marketDataDelegate.searchTicker(ticker, exchange);
  }

  // STUB: future market-data API
  async getMarketData(id: CompanyRef): Promise<MarketData> {
    return this.marketDataDelegate.getMarketData(id);
  }

  // STUB: future market-data API
  async getPeer(ticker: string, exchange: Exchange): Promise<PeerData> {
    return this.marketDataDelegate.getPeer(ticker, exchange);
  }
}
