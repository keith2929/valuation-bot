import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { CompanySearchView } from "../views/CompanySearchView";

afterEach(() => {
  cleanup();
});

function renderSearchView(provider: CachedMarketDataProvider) {
  return render(
    <DataProvider provider={provider}>
      <CompanyProvider>
        <CompanySearchView />
      </CompanyProvider>
    </DataProvider>,
  );
}

describe("CompanySearchView", () => {
  it("resolves the default SIA company via FixtureProvider on load", async () => {
    const provider = new CachedMarketDataProvider(new FixtureProvider());
    renderSearchView(provider);

    await waitFor(() => expect(screen.getByText("Singapore Airlines Ltd")).toBeTruthy());
    expect(screen.getByText("SGD")).toBeTruthy();
  });

  it("hits the response cache on a repeat search for the same ticker + exchange", async () => {
    const fixture = new FixtureProvider();
    const searchSpy = vi.spyOn(fixture, "searchTicker");
    const provider = new CachedMarketDataProvider(fixture);
    renderSearchView(provider);

    // Default-company load on mount.
    await waitFor(() => expect(screen.getByText("Singapore Airlines Ltd")).toBeTruthy());
    expect(searchSpy).toHaveBeenCalledTimes(1);

    // Re-submit the same ticker/exchange via the search form.
    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "C6L" } });
    fireEvent.change(screen.getByLabelText("Exchange"), { target: { value: "SGX" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.getByText("Singapore Airlines Ltd")).toBeTruthy());
    // The underlying provider must not be hit again -- the cache served it.
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });
});
