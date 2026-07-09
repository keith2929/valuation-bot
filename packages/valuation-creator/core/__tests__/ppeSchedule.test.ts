// Tier-2 PP&E and D&A schedule test.
//
// Runs the capex-driven net PP&E rollforward (src/forecast.ts: buildPpeSchedule)
// against the SIA fixture and requires it to reproduce independently computed
// D&A, ending net PPE, and gross PPE (display-only) schedules within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS. The beginning-balance-driven identity
// (D&A off the beginning, not average, PPE balance) is also checked exactly.

import { describe, expect, it } from "vitest";

import { buildPpeSchedule, type PpeScheduleResult, type PpeScheduleYear } from "../src/forecast";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  siaPpeExpectedSchedules,
  siaPpeScheduleInput,
} from "./fixtures/siaPpeSchedule";

function expectScheduleClose(
  years: readonly PpeScheduleYear[],
  line: keyof typeof siaPpeExpectedSchedules & keyof PpeScheduleYear,
): void {
  const expected = siaPpeExpectedSchedules[line];
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

describe("PP&E and D&A schedule (tier 2, SIA fixture)", () => {
  const result: PpeScheduleResult = buildPpeSchedule(siaPpeScheduleInput);

  it("produces one schedule row per forecast year", () => {
    expect(result.years).toHaveLength(siaPpeScheduleInput.years.length);
    expect(result.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reproduces the D&A schedule within tolerance", () => {
    expectScheduleClose(result.years, "depreciationAndAmortisation");
  });

  it("reproduces the ending net PPE schedule within tolerance", () => {
    expectScheduleClose(result.years, "endingNetPPE");
  });

  it("reproduces the display-only gross PPE schedule within tolerance", () => {
    expectScheduleClose(result.years, "grossPPE");
  });

  it("anchors year 1's beginning balance on the base net PPE", () => {
    expect(result.years[0]!.beginningNetPPE).toBe(siaPpeScheduleInput.baseNetPPE);
  });

  it("chains each year's ending balance into the next year's beginning balance", () => {
    for (let i = 1; i < result.years.length; i++) {
      expect(result.years[i]!.beginningNetPPE).toBe(result.years[i - 1]!.endingNetPPE);
    }
  });

  it("computes D&A off the BEGINNING (not average) net PPE balance", () => {
    for (const year of result.years) {
      expect(year.depreciationAndAmortisation).toBe(
        year.beginningNetPPE * siaPpeScheduleInput.depreciationRateOnNetPPE,
      );
    }
  });

  it("satisfies the rollforward identity exactly", () => {
    for (const year of result.years) {
      expect(year.endingNetPPE).toBe(
        year.beginningNetPPE + year.capitalExpenditure - year.depreciationAndAmortisation,
      );
    }
  });
});
