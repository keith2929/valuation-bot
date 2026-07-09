import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { ValuationsView } from "../views/ValuationsView";

afterEach(() => {
  cleanup();
});

function renderValuations() {
  return render(
    <DataProvider provider={new CachedMarketDataProvider(new FixtureProvider())}>
      <CompanyProvider>
        <AssumptionsProvider>
          <ValuationsView />
        </AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>,
  );
}

describe("ValuationsView", () => {
  it("reproduces the Tier-1 DCF goldens: Gordon Growth 9.8725, Exit Multiple 5.9055, upside -9.0%", async () => {
    renderValuations();

    await waitFor(() => expect(screen.getByTestId("dcf-gordon-price").textContent).toBe("9.8725"));
    expect(screen.getByTestId("dcf-exit-price").textContent).toBe("5.9055");
    expect(screen.getByTestId("dcf-exit-upside").textContent).toBe("-9.0%");

    // Mid-year discount periods 0.5 .. 4.5 for the 5-year explicit forecast.
    expect(screen.getByTestId("dcf-discount-period-1").textContent).toBe("0.5");
    expect(screen.getByTestId("dcf-discount-period-2").textContent).toBe("1.5");
    expect(screen.getByTestId("dcf-discount-period-3").textContent).toBe("2.5");
    expect(screen.getByTestId("dcf-discount-period-4").textContent).toBe("3.5");
    expect(screen.getByTestId("dcf-discount-period-5").textContent).toBe("4.5");
  });

  it("reproduces the Tier-1 DDM golden: implied price 3.8674", async () => {
    renderValuations();

    await waitFor(() => expect(screen.getByTestId("ddm-price").textContent).toBe("3.8674"));
  });

  it("reproduces the comps LTM EV/EBITDA median (4.75x, matching the DCF's default exit multiple)", async () => {
    renderValuations();

    await waitFor(() =>
      expect(screen.getByTestId("comps-ev-ebitda-ltm-median-multiple").textContent).toBe("4.75x"),
    );
    // Peer table renders all 4 comps peers.
    expect(screen.getByText("Cathay Pacific")).toBeTruthy();
    expect(screen.getByText("ANA")).toBeTruthy();
    expect(screen.getByText("Korean Air")).toBeTruthy();
    expect(screen.getByText("Japan Airlines")).toBeTruthy();
  });
});
