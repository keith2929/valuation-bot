// Tier-2 working-capital schedule test.
//
// Runs the days/percent-of-revenue-driven working-capital rollforward
// (src/forecast.ts: buildWorkingCapitalSchedule) against the SIA fixture and
// requires it to reproduce independently computed NWC/changeNWC schedules
// (and the FY26 circular-OCL/TCL spot check) within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS.

import { describe, expect, it } from "vitest";

import { buildWorkingCapitalSchedule, type WorkingCapitalScheduleYear } from "../src/forecast";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  SIA_FY26_OTHER_CURRENT_LIABILITIES,
  SIA_FY26_TOTAL_CURRENT_LIABILITIES,
  siaWorkingCapitalExpectedSchedules,
  siaWorkingCapitalInput,
} from "./fixtures/siaWorkingCapital";

function expectScheduleClose(
  years: readonly WorkingCapitalScheduleYear[],
  line: keyof typeof siaWorkingCapitalExpectedSchedules & keyof WorkingCapitalScheduleYear,
): void {
  const expected = siaWorkingCapitalExpectedSchedules[line];
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

describe("working-capital schedule (tier 2, SIA fixture)", () => {
  const result = buildWorkingCapitalSchedule(siaWorkingCapitalInput);

  it("produces one schedule row per forecast year", () => {
    expect(result.years).toHaveLength(siaWorkingCapitalInput.years.length);
    expect(result.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reproduces the net working capital schedule within tolerance", () => {
    expectScheduleClose(result.years, "netWorkingCapital");
  });

  it("reproduces the change-in-net-working-capital schedule within tolerance", () => {
    expectScheduleClose(result.years, "changeInNetWorkingCapital");
  });

  it("FY26 (year 1) other current liabilities matches the algebraic OCL solve", () => {
    const year1 = result.years[0]!;
    expect(Math.abs(year1.otherCurrentLiabilities - SIA_FY26_OTHER_CURRENT_LIABILITIES)).toBeLessThanOrEqual(
      ABSOLUTE_TOLERANCE_SGD_MILLIONS,
    );
  });

  it("FY26 (year 1) total current liabilities matches the spot check", () => {
    const year1 = result.years[0]!;
    expect(Math.abs(year1.totalCurrentLiabilities - SIA_FY26_TOTAL_CURRENT_LIABILITIES)).toBeLessThanOrEqual(
      ABSOLUTE_TOLERANCE_SGD_MILLIONS,
    );
  });

  it("holds otherCurrentAssets flat at the input level across all years", () => {
    for (const year of result.years) {
      expect(year.otherCurrentAssets).toBe(siaWorkingCapitalInput.otherCurrentAssets);
    }
  });

  it("satisfies otherCurrentLiabilities = ratio * totalCurrentLiabilities exactly", () => {
    const ratio = siaWorkingCapitalInput.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities;
    for (const year of result.years) {
      expect(year.otherCurrentLiabilities).toBeCloseTo(ratio * year.totalCurrentLiabilities, 9);
    }
  });

  it("satisfies the NWC and changeNWC identities exactly", () => {
    let previous = siaWorkingCapitalInput.openingNetWorkingCapital;
    for (const year of result.years) {
      expect(year.netWorkingCapital).toBe(
        year.receivables +
          year.inventory +
          year.prepaid +
          year.otherCurrentAssets -
          (year.accountsPayable + year.accrued + year.unearnedRevenue + year.otherCurrentLiabilities),
      );
      expect(year.changeInNetWorkingCapital).toBe(previous - year.netWorkingCapital);
      previous = year.netWorkingCapital;
    }
  });

  it("holds currentLeases and taxesPayable out of the NWC level (they only feed the OCL/TCL solve)", () => {
    for (const year of result.years) {
      expect(year.totalCurrentLiabilities).toBeCloseTo(
        year.accountsPayable +
          year.accrued +
          siaWorkingCapitalInput.currentLeases +
          siaWorkingCapitalInput.taxesPayable +
          year.unearnedRevenue +
          year.otherCurrentLiabilities,
        9,
      );
    }
  });

  it("rejects an empty years array", () => {
    expect(() => buildWorkingCapitalSchedule({ ...siaWorkingCapitalInput, years: [] })).toThrow(
      RangeError,
    );
  });

  it("rejects a ratio outside [0, 1)", () => {
    expect(() =>
      buildWorkingCapitalSchedule({
        ...siaWorkingCapitalInput,
        otherCurrentLiabilitiesPctOfTotalCurrentLiabilities: 1,
      }),
    ).toThrow(RangeError);
  });
});
