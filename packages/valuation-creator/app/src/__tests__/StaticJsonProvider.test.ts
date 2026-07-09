import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyRef, MarketData, MarketDataProvider, PeerData } from "@valuation-bot/contract";
import { SIA_FINANCIALS } from "@valuation-bot/valuation-creator";
import { StaticJsonProvider } from "../providers/StaticJsonProvider";

const SIA_COMPANY: CompanyRef = {
  id: "SGX:C6L",
  name: "Singapore Airlines Ltd",
  ticker: "C6L",
  reportingCurrency: "SGD",
};

/** Stub delegate: records calls, throws on getFinancials (StaticJsonProvider must never reach it). */
class DelegateStub implements MarketDataProvider {
  readonly calls: string[] = [];

  async searchTicker(): Promise<CompanyRef> {
    this.calls.push("searchTicker");
    return SIA_COMPANY;
  }
  async getFinancials(): Promise<never> {
    throw new Error("StaticJsonProvider must not delegate getFinancials");
  }
  async getMarketData(): Promise<MarketData> {
    this.calls.push("getMarketData");
    return { currentPrice: 1, sharesOutstanding: 1, week52High: 1, week52Low: 1, marketValueOfDebt: 1, cash: 1, currency: "SGD" };
  }
  async getPeer(): Promise<PeerData> {
    this.calls.push("getPeer");
    return {
      name: "Peer", ticker: "SGX:PEER", fxToTargetCurrency: 1, currentPrice: 1, sharesOutstanding: 1,
      cashAndSTInvestments: 1, totalDebt: 1, preferredEquity: 0, minorityInterest: 0, sales: 1, ebitda: 1,
      ebit: 1, earnings: 1, bookValue: 1, equityBeta5Y: 1, interestExpense: 1, marginalTaxRate: 0.17,
      ntmPE: 1, ntmEvEbitda: 1,
    };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StaticJsonProvider", () => {
  it("fetches statements + warnings from the given data URL and caches warnings per company id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statements: SIA_FINANCIALS, warnings: ["some warning"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new StaticJsonProvider(new DelegateStub(), (ticker) => `/data/${ticker}.json`);
    const statements = await provider.getFinancials(SIA_COMPANY);

    expect(statements).toEqual(SIA_FINANCIALS);
    expect(fetchMock).toHaveBeenCalledWith("/data/C6L.json");
    expect(provider.getWarnings(SIA_COMPANY)).toEqual(["some warning"]);
  });

  it("returns [] from getWarnings before any fetch has happened", () => {
    const provider = new StaticJsonProvider(new DelegateStub(), (ticker) => `/data/${ticker}.json`);
    expect(provider.getWarnings(SIA_COMPANY)).toEqual([]);
  });

  it("throws when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const provider = new StaticJsonProvider(new DelegateStub(), (ticker) => `/data/${ticker}.json`);
    await expect(provider.getFinancials(SIA_COMPANY)).rejects.toThrow(/404/);
  });

  it("delegates searchTicker, getMarketData, and getPeer to the underlying provider", async () => {
    const delegate = new DelegateStub();
    const provider = new StaticJsonProvider(delegate, (ticker) => `/data/${ticker}.json`);

    await provider.searchTicker("C6L", "SGX");
    await provider.getMarketData(SIA_COMPANY);
    await provider.getPeer("PEER", "SGX");

    expect(delegate.calls).toEqual(["searchTicker", "getMarketData", "getPeer"]);
  });
});
