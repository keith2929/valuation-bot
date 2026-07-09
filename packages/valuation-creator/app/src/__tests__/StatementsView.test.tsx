import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CompanyRef, Exchange, FinancialStatements, MarketData, MarketDataProvider, PeerData } from "@valuation-bot/contract";
import { FixtureProvider, SIA_FINANCIALS } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { StatementsView } from "../views/StatementsView";

afterEach(() => {
  cleanup();
});

function renderStatements(provider: MarketDataProvider, children: ReactNode = <StatementsView />) {
  return render(
    <DataProvider provider={provider}>
      <CompanyProvider>
        <AssumptionsProvider>{children}</AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>,
  );
}

const SIA_COMPANY: CompanyRef = {
  id: "SGX:C6L",
  name: "Singapore Airlines Ltd",
  ticker: "C6L",
  reportingCurrency: "SGD",
};

/** Minimal MarketDataProvider stub that also implements `getWarnings`, mimicking `ExtractionProvider`. */
class WarningStubProvider implements MarketDataProvider {
  constructor(private readonly warnings: string[]) {}

  async searchTicker(): Promise<CompanyRef> {
    return SIA_COMPANY;
  }
  async getFinancials(): Promise<FinancialStatements> {
    return SIA_FINANCIALS;
  }
  async getMarketData(): Promise<MarketData> {
    throw new Error("not used in this test");
  }
  async getPeer(): Promise<PeerData> {
    throw new Error("not used in this test");
  }
  getWarnings(_id: CompanyRef): string[] {
    return this.warnings;
  }
}

describe("StatementsView", () => {
  it("renders base-case FY26 revenue as 19,987.9 and Balanced for every forecast year", async () => {
    renderStatements(new CachedMarketDataProvider(new FixtureProvider()));

    await waitFor(() => expect(screen.getByTestId("row-total-revenue-5").textContent).toBe("19,987.9"));

    // Forecast columns are index 5..9 (FY2026..FY2030).
    for (let i = 5; i <= 9; i++) {
      expect(screen.getByTestId(`row-balanced-${i}`).textContent).toBe("Balanced");
    }
  });

  it("does not render a warnings banner for a provider with no warnings", async () => {
    renderStatements(new CachedMarketDataProvider(new FixtureProvider()));

    await waitFor(() => expect(screen.getByTestId("row-total-revenue-5")).toBeTruthy());
    expect(screen.queryByTestId("statements-warnings-banner")).toBeNull();
  });

  it("surfaces provider warnings (e.g. ExtractionProvider.getWarnings) as a flagged banner", async () => {
    renderStatements(new CachedMarketDataProvider(new WarningStubProvider(["Field 'balanceSheet.goodwill' defaulted to 0"])));

    await waitFor(() => expect(screen.getByTestId("statements-warnings-banner")).toBeTruthy());
    expect(screen.getByText("Field 'balanceSheet.goodwill' defaulted to 0")).toBeTruthy();
  });
});
