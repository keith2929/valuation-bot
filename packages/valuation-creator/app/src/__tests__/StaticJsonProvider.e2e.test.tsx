import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { FixtureProvider, SIA_FINANCIALS } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { StatementsView } from "../views/StatementsView";
import { StaticJsonProvider } from "../providers/StaticJsonProvider";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * End-to-end check that the app renders real data when its only data source is
 * a fetched static JSON asset -- the same shape `emitStatic.ts` writes to
 * `public/data/<ticker>.json` for GitHub Pages -- not the in-memory fixture.
 */
describe("app on a StaticJsonProvider (GitHub Pages data path)", () => {
  it("renders FY26 revenue and a Balanced forecast sourced entirely from fetched JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statements: SIA_FINANCIALS, warnings: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new StaticJsonProvider(new FixtureProvider(), (ticker) => `/data/${ticker}.json`);

    render(
      <DataProvider provider={provider}>
        <CompanyProvider>
          <AssumptionsProvider>
            <StatementsView />
          </AssumptionsProvider>
        </CompanyProvider>
      </DataProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("row-total-revenue-5").textContent).toBe("19,987.9"));
    expect(fetchMock).toHaveBeenCalledWith("/data/C6L.json");

    for (let i = 5; i <= 9; i++) {
      expect(screen.getByTestId(`row-balanced-${i}`).textContent).toBe("Balanced");
    }
  });
});
