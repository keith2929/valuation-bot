// Tier-3 test for the composed forecast (src/forecast.ts: buildForecast),
// which wires the PP&E, income-statement, working-capital, net-income and
// balance-sheet/cash-flow schedules together off `SIA_FINANCIALS` into the
// full per-year forecast plus the summarised FCFF driver schedule and NTM
// metrics.

import { describe, expect, it } from "vitest";

import { buildForecast } from "../src/forecast";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  SIA_FORECAST_TERMINAL_EBITDA_MARGIN,
  siaForecastAssumptions,
  siaForecastExpectedFreeCashFlows,
  siaForecastExpectedNtm,
} from "./fixtures/siaForecastAssumptions";

describe("buildForecast (tier 3, SIA fixtures)", () => {
  const result = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");

  it("returns the full per-year schedule for every sub-forecast", () => {
    expect(result.incomeStatement.years).toHaveLength(5);
    expect(result.ppe.years).toHaveLength(5);
    expect(result.workingCapital.years).toHaveLength(5);
    expect(result.netIncome.years).toHaveLength(5);
    expect(result.balanceSheetCashFlow.years).toHaveLength(5);
    expect(result.drivers.years).toHaveLength(5);
  });

  it("reproduces the FCFF driver schedule to within tolerance", () => {
    result.drivers.freeCashFlows.forEach((fcff, i) => {
      expect(fcff).toBeCloseTo(siaForecastExpectedFreeCashFlows[i]!, 3);
    });
  });

  it("computes each driver year's fcff as ebit*(1-0.17) + dandA + capex + changeNWC", () => {
    for (const year of result.drivers.years) {
      expect(year.fcff).toBeCloseTo(
        year.ebit * (1 - 0.17) + year.dandA + year.capex + year.changeNWC,
        Math.max(0, ABSOLUTE_TOLERANCE_SGD_MILLIONS),
      );
      expect(year.capex).toBeLessThanOrEqual(0);
    }
  });

  it("computes the terminal EBITDA and EBITDA margin off the final forecast year", () => {
    const terminal = result.drivers.years[result.drivers.years.length - 1]!;
    expect(result.drivers.terminalEBITDA).toBe(terminal.ebitda);
    expect(result.drivers.terminalEBITDAMargin).toBeCloseTo(
      SIA_FORECAST_TERMINAL_EBITDA_MARGIN,
      8,
    );
  });

  it("computes NTM metrics off forecast year 1 (FY26)", () => {
    expect(result.ntm.ntmEarnings).toBeCloseTo(siaForecastExpectedNtm.ntmEarnings, 3);
    expect(result.ntm.ntmEbitda).toBeCloseTo(siaForecastExpectedNtm.ntmEbitda, 3);
    expect(result.ntm.ntmDebt).toBeCloseTo(siaForecastExpectedNtm.ntmDebt, 2);
    expect(result.ntm.ntmCash).toBeCloseTo(siaForecastExpectedNtm.ntmCash, 3);
  });

  it("throws when assumptions.years is empty", () => {
    expect(() =>
      buildForecast(SIA_FINANCIALS, { ...siaForecastAssumptions, years: [] }, "base"),
    ).toThrow(RangeError);
  });
});
