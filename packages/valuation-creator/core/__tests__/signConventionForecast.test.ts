// WP-D7 close-out: a sign-convention regression test. `SIA_FINANCIALS`
// stores `incomeStatement.interestExpense` and `cashFlow.capex` as negative
// numbers (expense/spend). If a future data feed (e.g. a different
// extraction source) delivered these same series sign-flipped (positive),
// `buildForecast`'s FCFF assembly must not silently produce a corrupted
// FCFF_FY26 — it must either normalise the sign (as
// `deriveOperatingAssumptions` already does for `interestExpense` via
// `Math.abs`, and implicitly does for `cashFlow.capex`, which the forecast
// pipeline never reads at all) or throw. This pins FCFF_FY26 to the same
// golden the correctly-signed fixture produces
// (`siaForecastExpectedFreeCashFlows[0]`, see buildForecast.test.ts) so a
// regression that lets a flipped sign leak into the FCFF calculation is
// caught.

import { describe, expect, it } from "vitest";

import { buildForecast } from "../src/forecast";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import { siaForecastAssumptions, siaForecastExpectedFreeCashFlows } from "./fixtures/siaForecastAssumptions";

const SIGN_FLIPPED_FINANCIALS = {
  ...SIA_FINANCIALS,
  incomeStatement: {
    ...SIA_FINANCIALS.incomeStatement,
    interestExpense: SIA_FINANCIALS.incomeStatement.interestExpense.map((v) => -v),
  },
  cashFlow: {
    ...SIA_FINANCIALS.cashFlow,
    capex: SIA_FINANCIALS.cashFlow.capex.map((v) => -v),
  },
};

describe("buildForecast sign-convention robustness (WP-D7)", () => {
  const expectedFcffFy26 = siaForecastExpectedFreeCashFlows[0]!;

  it("FCFF_FY26 matches the golden against the correctly-signed fixture", () => {
    const result = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");
    expect(result.drivers.freeCashFlows[0]).toBeCloseTo(expectedFcffFy26, 3);
  });

  it("either normalises a sign-flipped interestExpense/capex feed to the same FCFF_FY26, or throws", () => {
    let fcffFy26: number | undefined;
    let threw = false;
    try {
      const result = buildForecast(SIGN_FLIPPED_FINANCIALS, siaForecastAssumptions, "base");
      fcffFy26 = result.drivers.freeCashFlows[0];
    } catch {
      threw = true;
    }

    if (!threw) {
      // A silently sign-flipped FCFF would land far from the golden
      // (856.34ish); this assertion fails against that corrupted value and
      // only passes if the engine truly normalised the flipped inputs.
      expect(fcffFy26).toBeCloseTo(expectedFcffFy26, 3);
    }
  });
});
