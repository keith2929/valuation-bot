// Tier-2 income-statement (P&L) forecast layer test.
//
// Runs the Bear/Base/Bull scenario toggle (src/forecast.ts:
// buildIncomeStatementForecast) against the SIA fixture and requires the
// Base case to reproduce the source Excel model's EBIT/EBITDA schedule
// within ABSOLUTE_TOLERANCE_SGD_MILLIONS, plus a spot check of the Bear
// scenario's FY26 COGS%.

import { describe, expect, it } from "vitest";

import { buildIncomeStatementForecast } from "../src/forecast";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  SIA_FY26_BEAR_COGS_PCT_REVENUE,
  siaIncomeStatementBaseInput,
  siaIncomeStatementExpectedSchedules,
} from "./fixtures/siaIncomeStatement";

describe("income statement forecast (tier 2, SIA fixture)", () => {
  describe("base scenario", () => {
    const result = buildIncomeStatementForecast(siaIncomeStatementBaseInput);

    it("produces one schedule row per forecast year", () => {
      expect(result.years).toHaveLength(siaIncomeStatementBaseInput.years.length);
      expect(result.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
    });

    it("reproduces the revenue schedule within tolerance", () => {
      result.years.forEach((year, i) => {
        const expected = siaIncomeStatementExpectedSchedules.revenue[i]!;
        expect(Math.abs(year.revenue - expected)).toBeLessThanOrEqual(
          ABSOLUTE_TOLERANCE_SGD_MILLIONS,
        );
      });
    });

    it("reproduces the EBIT schedule within tolerance", () => {
      result.years.forEach((year, i) => {
        const expected = siaIncomeStatementExpectedSchedules.ebit[i]!;
        expect(
          Math.abs(year.ebit - expected),
          `EBIT year ${year.year}: expected ${expected}, got ${year.ebit}`,
        ).toBeLessThanOrEqual(ABSOLUTE_TOLERANCE_SGD_MILLIONS);
      });
    });

    it("reproduces the EBITDA schedule within tolerance", () => {
      result.years.forEach((year, i) => {
        const expected = siaIncomeStatementExpectedSchedules.ebitda[i]!;
        expect(
          Math.abs(year.ebitda - expected),
          `EBITDA year ${year.year}: expected ${expected}, got ${year.ebitda}`,
        ).toBeLessThanOrEqual(ABSOLUTE_TOLERANCE_SGD_MILLIONS);
      });
    });

    it("holds amortOfGoodwillIntangibles at 0 and satisfies EBIT/EBITDA identities exactly", () => {
      for (const year of result.years) {
        expect(year.amortOfGoodwillIntangibles).toBe(0);
        expect(year.ebit).toBe(
          year.revenue -
            year.cogs -
            (year.sga + year.depreciationAndAmortisation + year.otherOpEx),
        );
        expect(year.ebitda).toBe(year.ebit + year.depreciationAndAmortisation);
      }
    });

    it("anchors year 1 on the last actual year, not on year 0 of the forecast", () => {
      const year1 = result.years[0]!;
      expect(year1.revenue).toBe(
        siaIncomeStatementBaseInput.baseRevenue *
          (1 + siaIncomeStatementBaseInput.years[0]!.revenueGrowthBase),
      );
    });
  });

  it("FY26 bear-scenario COGS% equals the base derived average minus the 2% offset", () => {
    const bearInput = { ...siaIncomeStatementBaseInput, scenario: "bear" as const };
    const result = buildIncomeStatementForecast(bearInput);
    const year1 = result.years[0]!;
    const cogsPctRevenue = year1.cogs / year1.revenue;
    expect(cogsPctRevenue).toBeCloseTo(SIA_FY26_BEAR_COGS_PCT_REVENUE, 9);
  });

  it("bull scenario shifts revenue growth, COGS%, SG&A%, and other-opex% up from base", () => {
    const baseResult = buildIncomeStatementForecast(siaIncomeStatementBaseInput);
    const bullResult = buildIncomeStatementForecast({
      ...siaIncomeStatementBaseInput,
      scenario: "bull",
    });
    expect(bullResult.years[0]!.revenue).toBeGreaterThan(baseResult.years[0]!.revenue);
    expect(bullResult.years[0]!.cogs / bullResult.years[0]!.revenue).toBeCloseTo(
      siaIncomeStatementBaseInput.years[0]!.cogsPctRevenueBase + 0.01,
      9,
    );
    expect(bullResult.years[0]!.sga / bullResult.years[0]!.revenue).toBeCloseTo(
      siaIncomeStatementBaseInput.sgaPctRevenueBase + 0.01,
      9,
    );
    expect(bullResult.years[0]!.otherOpEx / bullResult.years[0]!.revenue).toBeCloseTo(
      siaIncomeStatementBaseInput.otherOpExPctRevenueBase + 0.01,
      9,
    );
  });

  it("rejects an empty years array", () => {
    expect(() =>
      buildIncomeStatementForecast({ ...siaIncomeStatementBaseInput, years: [] }),
    ).toThrow(RangeError);
  });
});
