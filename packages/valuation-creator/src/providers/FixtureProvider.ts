import type {
  CompanyRef,
  Exchange,
  FinancialStatements,
  MarketData,
  MarketDataProvider,
  PeerData,
} from "@valuation-bot/contract";
import { SIA_BETA_PEERS, SIA_COMPS_PEERS, SIA_FINANCIALS, SIA_MARKET } from "./siaFixture";

const SIA_COMPANY: CompanyRef = {
  id: "SGX:C6L",
  name: "Singapore Airlines Ltd",
  ticker: "C6L",
  reportingCurrency: "SGD",
};

/**
 * MarketDataProvider backed by the embedded SIA fixture (Part 6 of the spec).
 * Serves as the reference-model data source until a live market-data API is wired up.
 */
export class FixtureProvider implements MarketDataProvider {
  async searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef> {
    if (ticker.toUpperCase() !== SIA_COMPANY.ticker || exchange !== "SGX") {
      throw new Error(`FixtureProvider: no fixture data for ${exchange}:${ticker}`);
    }
    return SIA_COMPANY;
  }

  async getFinancials(id: CompanyRef): Promise<FinancialStatements> {
    this.assertSia(id);
    return SIA_FINANCIALS;
  }

  async getMarketData(id: CompanyRef): Promise<MarketData> {
    this.assertSia(id);
    return SIA_MARKET;
  }

  async getPeer(ticker: string, exchange: Exchange): Promise<PeerData> {
    const key = `${exchange}:${ticker}`;
    const comp = SIA_COMPS_PEERS.find((peer) => peer.ticker === key);
    if (!comp) {
      throw new Error(`FixtureProvider: no fixture data for ${exchange}:${ticker}`);
    }
    const beta = SIA_BETA_PEERS.find((peer) => peer.name === comp.name);

    return {
      name: comp.name,
      ticker: comp.ticker,
      fxToTargetCurrency: comp.fx,
      currentPrice: comp.price,
      sharesOutstanding: comp.shares,
      cashAndSTInvestments: comp.cashSTI,
      totalDebt: comp.totalDebt,
      preferredEquity: 0,
      minorityInterest: comp.minorityInterest,
      sales: comp.sales,
      ebitda: comp.ebitda,
      ebit: comp.ebit,
      earnings: comp.earnings,
      bookValue: comp.bookValue,
      equityBeta5Y: beta?.equityBeta5Y ?? 0,
      interestExpense: 0,
      marginalTaxRate: beta?.marginalTaxRate ?? 0,
      ntmPE: comp.ntmPE,
      ntmEvEbitda: comp.ntmEvEbitda,
    };
  }

  private assertSia(id: CompanyRef): void {
    if (id.id !== SIA_COMPANY.id) {
      throw new Error(`FixtureProvider: no fixture data for company id ${id.id}`);
    }
  }
}
