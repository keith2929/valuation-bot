import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { FootballFieldView } from "../views/FootballFieldView";

afterEach(() => {
  cleanup();
});

function renderFootball() {
  return render(
    <DataProvider provider={new CachedMarketDataProvider(new FixtureProvider())}>
      <CompanyProvider>
        <AssumptionsProvider>
          <FootballFieldView />
        </AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>,
  );
}

// Fixed Excel order of the seven football-field bars (footballField.ts).
const EXCEL_ORDER = [
  "dcfGordonGrowth",
  "dcfExitMultiple",
  "evEbitdaLtm",
  "pbLtm",
  "evEbitdaNtm",
  "ddm",
  "week52Range",
];

describe("FootballFieldView", () => {
  it("renders 7 bars in the Excel order with a mean marker each", async () => {
    renderFootball();
    const table = await screen.findByTestId("football-table");

    const rows = within(table).getAllByTestId(/^football-bar-/);
    expect(rows.length).toBe(7);
    expect(rows.map((r) => r.getAttribute("data-testid")!.replace("football-bar-", ""))).toEqual(EXCEL_ORDER);

    // Mean marker value present for every bar.
    for (const method of EXCEL_ORDER) {
      expect(screen.getByTestId(`football-mean-${method}`).textContent).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("shows both overlay reference lines: current 6.49 and target 5.91", async () => {
    renderFootball();
    await waitFor(() => expect(screen.getByTestId("football-current-price")).toBeTruthy());
    expect(screen.getByTestId("football-current-price").textContent).toContain("6.49");
    expect(screen.getByTestId("football-target-price").textContent).toContain("5.91");
  });
});
