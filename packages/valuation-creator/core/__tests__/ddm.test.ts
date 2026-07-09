// Dividend discount model test.
//
// Runs the Excel DDM (src/ddm.ts): aggregate dividends off net income and a
// payout ratio, specials carved out of the total (not additive), mid-year
// discounting over t = 0.5, 1.5, ..., N - 0.5, and a terminal value grown off
// the final year's TOTAL dividend. Reproduces the source Excel "DDM" sheet's
// headline outputs to a tight tolerance, plus the underlying accounting
// identities and validation.

import { describe, expect, it } from "vitest";

import { averagePayoutRatio, ddm, type DdmInput } from "../src/ddm";
import {
  DDM_ABSOLUTE_TOLERANCE,
  DDM_PER_SHARE_TOLERANCE,
  siaDdmCostOfEquity,
  siaDdmExpected,
  siaDdmExpectedPayoutRatio,
  siaDdmForecastNetIncome,
  siaDdmHistory,
  siaDdmSharesOutstanding,
  siaDdmSpecialDividendsPerShare,
  siaDdmTerminalGrowthRate,
} from "./fixtures/siaDdm";

function expectClose(actual: number, expected: number, tolerance: number, label: string): void {
  const difference = Math.abs(actual - expected);
  expect(
    difference,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  ).toBeLessThanOrEqual(tolerance);
}

const baseInput: DdmInput = {
  history: siaDdmHistory,
  forecastNetIncome: siaDdmForecastNetIncome,
  sharesOutstanding: siaDdmSharesOutstanding,
  specialDividendsPerShare: siaDdmSpecialDividendsPerShare,
  costOfEquity: siaDdmCostOfEquity,
  terminalGrowthRate: siaDdmTerminalGrowthRate,
};

describe("averagePayoutRatio (aggregate dividends / net income)", () => {
  it("averages the last two historical years' totalDividendsPaid / netIncome", () => {
    const result = averagePayoutRatio(siaDdmHistory);
    expectClose(
      result.averagePayoutRatio,
      siaDdmExpectedPayoutRatio,
      1e-12,
      "averagePayoutRatio",
    );
    expect(result.years).toHaveLength(2);
    expect(result.years[0]!.payoutRatio).toBeCloseTo(1130.2 / 2674.8, 12);
    expect(result.years[1]!.payoutRatio).toBeCloseTo(1428.8 / 2778.0, 12);
  });

  it("throws with fewer than 2 historical years", () => {
    expect(() => averagePayoutRatio([siaDdmHistory[0]!])).toThrow(RangeError);
  });

  it("throws when netIncome <= 0", () => {
    expect(() =>
      averagePayoutRatio([...siaDdmHistory, { totalDividendsPaid: 1, netIncome: 0 }]),
    ).toThrow(RangeError);
  });

  it("throws when totalDividendsPaid < 0", () => {
    expect(() =>
      averagePayoutRatio([...siaDdmHistory, { totalDividendsPaid: -1, netIncome: 100 }]),
    ).toThrow(RangeError);
  });
});

describe("ddm (tier 1/2, SIA fixture, Excel DDM golden values)", () => {
  const result = ddm(baseInput);

  it("derives the payout ratio from the last two historical years", () => {
    expectClose(result.payout.averagePayoutRatio, siaDdmExpectedPayoutRatio, 1e-12, "payoutRatio");
  });

  it("carves specials out of the total rather than adding them on top", () => {
    result.years.forEach((year, i) => {
      expect(year.commonDividends).toBeCloseTo(year.totalDividends - year.specialDividends, 9);
      const expectedSpecial = siaDdmSpecialDividendsPerShare[i]! * siaDdmSharesOutstanding;
      expectClose(year.specialDividends, expectedSpecial, 1e-9, `specialDividends year ${i + 1}`);
    });
  });

  it("discounts each year's TOTAL dividend at mid-year periods 0.5..N-0.5", () => {
    result.years.forEach((year, i) => {
      expect(year.discountPeriod).toBe(i + 1 - 0.5);
      expectClose(
        year.discountFactor,
        1 / Math.pow(1 + siaDdmCostOfEquity, year.discountPeriod),
        1e-15,
        `discountFactor year ${i + 1}`,
      );
      expectClose(
        year.presentValue,
        year.totalDividends * year.discountFactor,
        1e-9,
        `presentValue year ${i + 1}`,
      );
    });
  });

  it("matches the Excel DDM sheet's PV of dividends", () => {
    expectClose(
      result.presentValueOfDividends,
      siaDdmExpected.presentValueOfDividends,
      DDM_ABSOLUTE_TOLERANCE,
      "presentValueOfDividends",
    );
  });

  it("grows the terminal value off the final year's TOTAL dividend, discounted over N - 0.5", () => {
    const horizon = result.years.length;
    expect(result.terminal.discountPeriod).toBe(horizon - 0.5);
    const finalTotal = result.years[horizon - 1]!.totalDividends;
    expectClose(
      result.terminal.terminalValue,
      (finalTotal * (1 + siaDdmTerminalGrowthRate)) /
        (siaDdmCostOfEquity - siaDdmTerminalGrowthRate),
      DDM_ABSOLUTE_TOLERANCE,
      "terminalValue",
    );
    expectClose(
      result.terminal.terminalValue,
      siaDdmExpected.terminalValue,
      DDM_ABSOLUTE_TOLERANCE,
      "terminalValue (golden)",
    );
    expectClose(
      result.terminal.presentValueOfTerminalValue,
      siaDdmExpected.presentValueOfTerminalValue,
      DDM_ABSOLUTE_TOLERANCE,
      "presentValueOfTerminalValue",
    );
  });

  it("matches the Excel DDM sheet's equity value and implied price per share", () => {
    expectClose(result.equityValue, siaDdmExpected.equityValue, DDM_ABSOLUTE_TOLERANCE, "equityValue");
    expectClose(
      result.equityValue,
      result.presentValueOfDividends + result.terminal.presentValueOfTerminalValue,
      1e-9,
      "equityValue identity",
    );
    expectClose(
      result.impliedPrice,
      siaDdmExpected.impliedPrice,
      DDM_PER_SHARE_TOLERANCE,
      "impliedPrice",
    );
    expectClose(
      result.impliedPrice,
      result.equityValue / siaDdmSharesOutstanding,
      1e-12,
      "impliedPrice identity",
    );
  });

  it("computes terminalValueShareOfValue as PV(TV) / equityValue", () => {
    expect(result.terminalValueShareOfValue).toBeCloseTo(
      result.terminal.presentValueOfTerminalValue / result.equityValue,
      12,
    );
  });
});

describe("ddm validation", () => {
  it("throws when forecastNetIncome is empty", () => {
    expect(() => ddm({ ...baseInput, forecastNetIncome: [] })).toThrow(RangeError);
  });

  it("throws when sharesOutstanding <= 0", () => {
    expect(() => ddm({ ...baseInput, sharesOutstanding: 0 })).toThrow(RangeError);
  });

  it("throws when costOfEquity <= 0", () => {
    expect(() => ddm({ ...baseInput, costOfEquity: 0 })).toThrow(RangeError);
  });

  it("throws when terminalGrowthRate >= costOfEquity", () => {
    expect(() => ddm({ ...baseInput, terminalGrowthRate: siaDdmCostOfEquity })).toThrow(
      RangeError,
    );
  });

  it("throws when specialDividendsPerShare is longer than the forecast", () => {
    expect(() =>
      ddm({ ...baseInput, specialDividendsPerShare: [0.1, 0.1, 0.1, 0, 0, 0.1] }),
    ).toThrow(RangeError);
  });

  it("throws when a special dividend per share is negative", () => {
    expect(() => ddm({ ...baseInput, specialDividendsPerShare: [-0.1] })).toThrow(RangeError);
  });
});
