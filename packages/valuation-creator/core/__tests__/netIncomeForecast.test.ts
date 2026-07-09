// Tier-2 debt / interest / tax / net-income schedule test.
//
// Runs the below-EBIT rollforward (src/forecast.ts: buildNetIncomeForecast) —
// including the circular cash ↔ interest-income fixed point — against the SIA
// fixture and requires it to reproduce the source model's debt, interest,
// net-income, dividend and ending-cash schedules within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS, plus the below-EBIT accounting identities.

import { describe, expect, it } from "vitest";

import { buildNetIncomeForecast, type NetIncomeForecastYear } from "../src/forecast";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  siaNetIncomeExpectedSchedules,
  siaNetIncomeInput,
} from "./fixtures/siaNetIncome";

function expectScheduleClose(
  years: readonly NetIncomeForecastYear[],
  line: keyof typeof siaNetIncomeExpectedSchedules & keyof NetIncomeForecastYear,
): void {
  const expected = siaNetIncomeExpectedSchedules[line];
  expect(years).toHaveLength(expected.length);
  years.forEach((year, i) => {
    const actual = year[line] as number;
    const difference = Math.abs(actual - expected[i]!);
    expect(
      difference,
      `${line} year ${year.year}: expected ${expected[i]} ± ${ABSOLUTE_TOLERANCE_SGD_MILLIONS}, got ${actual}`,
    ).toBeLessThanOrEqual(ABSOLUTE_TOLERANCE_SGD_MILLIONS);
  });
}

describe("net-income schedule (tier 2, SIA fixture)", () => {
  const result = buildNetIncomeForecast(siaNetIncomeInput);

  it("produces one schedule row per forecast year", () => {
    expect(result.years).toHaveLength(siaNetIncomeInput.years.length);
    expect(result.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reproduces the constant debt schedule within tolerance", () => {
    expectScheduleClose(result.years, "debt");
  });

  it("reproduces the interest expense schedule within tolerance", () => {
    expectScheduleClose(result.years, "interestExpense");
  });

  it("reproduces the (circular) interest income schedule within tolerance", () => {
    expectScheduleClose(result.years, "interestIncome");
  });

  it("reproduces the net income schedule within tolerance", () => {
    expectScheduleClose(result.years, "netIncome");
  });

  it("reproduces the dividend schedule within tolerance", () => {
    expectScheduleClose(result.years, "dividends");
  });

  it("reproduces the ending cash schedule within tolerance", () => {
    expectScheduleClose(result.years, "endingCash");
  });

  it("holds debt flat at targetDebtToEquity * bookValueOfEquity", () => {
    const debt = siaNetIncomeInput.targetDebtToEquity * siaNetIncomeInput.bookValueOfEquity;
    for (const year of result.years) {
      expect(year.debt).toBe(debt);
    }
  });

  it("prices interest expense off the average opening/closing debt balance", () => {
    let previousDebt = siaNetIncomeInput.baseTotalDebt;
    for (const year of result.years) {
      expect(year.interestExpense).toBeCloseTo(
        ((previousDebt + year.debt) / 2) * siaNetIncomeInput.interestRateOnDebt,
        9,
      );
      previousDebt = year.debt;
    }
  });

  it("satisfies the EBT / tax / net-income identities exactly", () => {
    const { years } = siaNetIncomeInput;
    result.years.forEach((year, i) => {
      expect(year.ebt).toBe(years[i]!.ebit + year.interestIncome - year.interestExpense);
      expect(year.incomeTaxExpense).toBe(year.ebt * siaNetIncomeInput.taxRate);
      expect(year.minorityInterest).toBe(0);
      expect(year.netIncome).toBe(year.ebt - year.incomeTaxExpense - year.minorityInterest);
      expect(year.dividends).toBe(siaNetIncomeInput.payoutRatio * year.netIncome);
    });
  });

  it("closes the cash rollforward and satisfies the interest-income fixed point", () => {
    const { years } = siaNetIncomeInput;
    let beginningCash = siaNetIncomeInput.openingCash;
    let previousDebt = siaNetIncomeInput.baseTotalDebt;
    result.years.forEach((year, i) => {
      const input = years[i]!;
      expect(year.beginningCash).toBe(beginningCash);
      const expectedChange =
        year.netIncome +
        input.depreciationAndAmortisation +
        input.changeInNetWorkingCapital -
        input.capitalExpenditure +
        (year.debt - previousDebt) -
        year.dividends;
      expect(year.changeInCash).toBeCloseTo(expectedChange, 9);
      expect(year.endingCash).toBeCloseTo(year.beginningCash + year.changeInCash, 9);
      // The fixed point: interest income equals the yield on the year-end cash base.
      expect(year.interestIncome).toBeCloseTo(
        (year.endingCash + siaNetIncomeInput.shortTermInvestments) *
          siaNetIncomeInput.yieldOnCashAndShortTermInvestments,
        9,
      );
      beginningCash = year.endingCash;
      previousDebt = year.debt;
    });
  });

  it("rejects an empty years array", () => {
    expect(() => buildNetIncomeForecast({ ...siaNetIncomeInput, years: [] })).toThrow(RangeError);
  });

  it("rejects a tax rate outside [0, 1)", () => {
    expect(() => buildNetIncomeForecast({ ...siaNetIncomeInput, taxRate: 1 })).toThrow(RangeError);
  });

  it("rejects a payout ratio outside [0, 1]", () => {
    expect(() => buildNetIncomeForecast({ ...siaNetIncomeInput, payoutRatio: 1.5 })).toThrow(
      RangeError,
    );
  });
});
