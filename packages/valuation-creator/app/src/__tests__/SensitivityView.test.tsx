import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { DataProvider } from "../providers/ProviderContext";
import { CachedMarketDataProvider } from "../providers/CachedMarketDataProvider";
import { CompanyProvider } from "../company/CompanyContext";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { SensitivityView } from "../views/SensitivityView";

afterEach(() => {
  cleanup();
});

function renderSensitivity() {
  return render(
    <DataProvider provider={new CachedMarketDataProvider(new FixtureProvider())}>
      <CompanyProvider>
        <AssumptionsProvider>
          <SensitivityView />
        </AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>,
  );
}

// Each grid's centre cell must equal that grid's base implied price, rounded to
// the 2dp shown in the cell. Base prices are the Tier-1 goldens reproduced by
// ValuationsView (Gordon 9.8725, Exit 5.9055, DDM 3.8674).
const GRIDS: { testId: string; centre: string }[] = [
  { testId: "grid-dcf-gordon", centre: "9.87" },
  { testId: "grid-dcf-exit-margin", centre: "5.91" },
  { testId: "grid-dcf-exit-multiple", centre: "5.91" },
  { testId: "grid-ddm", centre: "3.87" },
];

describe("SensitivityView", () => {
  it("renders all four heatmaps with the base implied price in each centre cell", async () => {
    renderSensitivity();
    await waitFor(() => expect(screen.getByTestId("grid-dcf-gordon")).toBeTruthy());

    for (const { testId, centre } of GRIDS) {
      const grid = screen.getByTestId(testId);
      expect(grid.tagName).toBe("TABLE"); // heatmap TABLE, not a line chart
      const centreCell = screen.getByTestId(`${testId}-centre`);
      expect(centreCell.getAttribute("data-centre")).toBe("true");
      expect(centreCell.textContent).toBe(centre);
      // 5x5 grid -> 5 data rows, each with 5 value cells + 1 row header.
      const bodyRows = within(grid).getAllByRole("row").slice(1); // drop the column header row
      expect(bodyRows.length).toBe(5);
    }
  });

  it("colour-scales cells (each populated cell gets a background)", async () => {
    renderSensitivity();
    const centre = await screen.findByTestId("grid-dcf-gordon-centre");
    expect(centre.getAttribute("style")).toMatch(/background/);
  });

  it("exposes editable step-size inputs bound to the assumptions panel", async () => {
    renderSensitivity();
    await waitFor(() => expect(screen.getByTestId("step-wacc")).toBeTruthy());
    // Default WACC step 0.01 -> shown as 1 (%).
    expect((screen.getByTestId("step-wacc") as HTMLInputElement).value).toBe("1");
    expect(screen.getByTestId("step-exitMultiple")).toBeTruthy();
    expect(screen.getByTestId("step-ddmTerminalGrowth")).toBeTruthy();
  });
});
