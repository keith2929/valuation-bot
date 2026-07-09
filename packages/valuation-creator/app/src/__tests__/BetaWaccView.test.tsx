import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { BetaWaccView } from "../views/BetaWaccView";

afterEach(() => {
  cleanup();
});

function renderBetaWacc() {
  return render(
    <DataProvider provider={new CachedMarketDataProvider(new FixtureProvider())}>
      <CompanyProvider>
        <AssumptionsProvider>
          <BetaWaccView />
        </AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>,
  );
}

describe("BetaWaccView", () => {
  it("defaults to Qantas excluded, reproducing avg asset beta 0.4805 / equity beta 0.6868 / WACC 6.10%", async () => {
    renderBetaWacc();

    await waitFor(() => expect(screen.getByTestId("average-asset-beta").textContent).toBe("0.4805"));
    expect(screen.getByTestId("relevered-equity-beta").textContent).toBe("0.6868");
    expect(screen.getByTestId("wacc-result").textContent).toBe("6.10%");
    expect(screen.getByTestId("wacc-ke").textContent).toBe("7.35%");
    expect(screen.getByTestId("wacc-kd-pretax").textContent).toBe("4.10%");
    expect(screen.getByTestId("wacc-kd-aftertax").textContent).toBe("3.40%");
    expect(screen.getByTestId("wacc-mv-equity").textContent).toBe("20,455.8");
    expect(screen.getByTestId("wacc-mv-debt").textContent).toBe("9,510.7");

    const qantasCheckbox = screen.getByTestId("peer-include-Qantas") as HTMLInputElement;
    expect(qantasCheckbox.checked).toBe(false);
  });

  it("changes the average asset beta when Qantas is toggled back in", async () => {
    renderBetaWacc();

    await waitFor(() => expect(screen.getByTestId("average-asset-beta").textContent).toBe("0.4805"));

    const qantasCheckbox = screen.getByTestId("peer-include-Qantas") as HTMLInputElement;
    fireEvent.click(qantasCheckbox);

    await waitFor(() => expect(screen.getByTestId("average-asset-beta").textContent).not.toBe("0.4805"));
    expect(qantasCheckbox.checked).toBe(true);
  });
});
