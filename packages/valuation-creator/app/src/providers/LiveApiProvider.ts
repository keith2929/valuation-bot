import type { CompanyRef, Exchange, FinancialStatements, MarketData, MarketDataProvider, PeerData } from "@valuation-bot/contract";

interface SearchResponse { ticker: string | null; companyName: string | null; exchange: string | null; currency: string | null; }

/** Step 1 live provider: resolves company identity without fetching financials. */
export class LiveApiProvider implements MarketDataProvider {
  constructor(private readonly apiBaseUrl: string) {}

  async searchTicker(ticker: string, _exchange: Exchange): Promise<CompanyRef> {
    const requestedTicker = ticker.trim().toUpperCase();
    const response = await fetch(`${this.apiBaseUrl}/api/search/${encodeURIComponent(requestedTicker)}`);
    if (!response.ok) throw new Error(`Live search failed (${response.status}).`);
    const result = await response.json() as SearchResponse;
    if (result.ticker?.toUpperCase() !== requestedTicker) {
      throw new Error(`Live search returned a different ticker for ${requestedTicker}; refusing to use it.`);
    }
    if (!result.companyName) throw new Error(`No live company could be resolved for ${requestedTicker}.`);
    return { id: `${result.exchange ?? "UNKNOWN"}:${result.ticker}`, name: result.companyName, ticker: result.ticker, reportingCurrency: result.currency ?? "Unknown" };
  }

  async getFinancials(_id: CompanyRef): Promise<FinancialStatements> { throw new Error("Live financial statements are not available until Step 2."); }
  async getMarketData(_id: CompanyRef): Promise<MarketData> { throw new Error("Live market data is not available until Step 2."); }
  async getPeer(_ticker: string, _exchange: Exchange): Promise<PeerData> { throw new Error("Live peer data is not available until Step 3."); }
}
