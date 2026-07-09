import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AssumptionsProvider } from "../assumptions/AssumptionsContext";
import { AssumptionsView } from "../views/AssumptionsView";

afterEach(() => {
  cleanup();
});

function renderView() {
  return render(
    <AssumptionsProvider>
      <AssumptionsView />
    </AssumptionsProvider>,
  );
}

describe("AssumptionsView", () => {
  it("defaults to the Base scenario with FY26 revenue growth at the seeded base value", () => {
    renderView();
    expect(screen.getByTestId("effective-revenue-growth-0").textContent).toBe("2.29%");
  });

  it("switching to Bull moves the FY26 revenue growth display to base + offset (0.0329)", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "Bull" } });
    expect(screen.getByTestId("effective-revenue-growth-0").textContent).toBe("3.29%");
  });

  it("switching to Bear moves the FY26 revenue growth display down by the same offset", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "Bear" } });
    expect(screen.getByTestId("effective-revenue-growth-0").textContent).toBe("1.29%");
  });

  it("editing the base revenue growth input updates the effective figure", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Base revenue growth FY26"), { target: { value: "0.05" } });
    expect(screen.getByTestId("effective-revenue-growth-0").textContent).toBe("5.00%");
  });
});
