// Tier-3 balance-sheet and cash-flow forecast test.
//
// Runs the closing block of the "3FS" sheet (src/forecast.ts:
// buildBalanceSheetCashFlowForecast) against the SIA fixture and requires it to
// (a) reproduce the source model's debt-issuance, ending-cash and totalAssets
// schedules within ABSOLUTE_TOLERANCE_SGD_MILLIONS, (b) satisfy the cash-flow
// and balance-sheet accounting identities, and (c) balance —
// totalAssets == totalLiabilities + totalEquity — for every forecast year.

import { describe, expect, it } from "vitest";

import {
  buildBalanceSheetCashFlowForecast,
  type BalanceSheetCashFlowYear,
} from "../src/forecast";
import {
  ABSOLUTE_TOLERANCE_SGD_MILLIONS,
  SIA_FY25_BOOK_VALUE_RESIDUAL,
  SIA_FY25_TRADING_ASSET_SECURITIES,
  SIA_FY26_TOTAL_ASSETS,
  siaBalanceSheetCashFlowExpectedSchedules,
  siaBalanceSheetCashFlowInput,
} from "./fixtures/siaBalanceSheetCashFlow";

function expectScheduleClose(
  years: readonly BalanceSheetCashFlowYear[],
  line: keyof typeof siaBalanceSheetCashFlowExpectedSchedules & keyof BalanceSheetCashFlowYear,
): void {
  const expected = siaBalanceSheetCashFlowExpectedSchedules[line];
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

describe("balance-sheet & cash-flow forecast (tier 3, SIA fixture)", () => {
  const input = siaBalanceSheetCashFlowInput;
  const result = buildBalanceSheetCashFlowForecast(input);

  it("recovers the FY25 reconciling constants (33.5 trading securities, 2.2 book-value residual)", () => {
    expect(SIA_FY25_TRADING_ASSET_SECURITIES).toBeCloseTo(33.5, 9);
    expect(SIA_FY25_BOOK_VALUE_RESIDUAL).toBeCloseTo(2.2, 9);
  });

  it("produces one schedule row per forecast year", () => {
    expect(result.years).toHaveLength(input.years.length);
    expect(result.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reproduces the debt-issuance schedule (only FY26 non-zero)", () => {
    expectScheduleClose(result.years, "debtIssued");
  });

  it("reproduces the ending-cash schedule within tolerance", () => {
    expectScheduleClose(result.years, "endingCash");
  });

  it("reproduces the total-assets schedule within tolerance", () => {
    expectScheduleClose(result.years, "totalAssets");
  });

  it("matches the FY26 total-assets anchor from the sheet", () => {
    expect(Math.abs(result.years[0]!.totalAssets - SIA_FY26_TOTAL_ASSETS)).toBeLessThanOrEqual(
      ABSOLUTE_TOLERANCE_SGD_MILLIONS,
    );
  });

  it("balances: totalAssets == totalLiabilities + totalEquity every year", () => {
    for (const year of result.years) {
      expect(
        Math.abs(year.totalAssets - (year.totalLiabilities + year.totalEquity)),
        `year ${year.year} does not balance`,
      ).toBeLessThanOrEqual(ABSOLUTE_TOLERANCE_SGD_MILLIONS);
    }
  });

  it("satisfies the cash-flow-statement identities exactly", () => {
    let beginningCash = input.openingCash;
    let previousDebt = input.baseTotalDebt;
    result.years.forEach((year, i) => {
      const y = input.years[i]!;
      expect(year.cashFromOperations).toBe(
        y.netIncome + y.depreciationAndAmortisation + y.changeInNetWorkingCapital,
      );
      expect(year.cashFromInvesting).toBe(-y.capitalExpenditure);
      expect(year.debtIssued).toBe(y.debt - previousDebt);
      expect(year.totalDividends).toBe(y.totalDividends);
      expect(year.cashFromFinancing).toBe(year.debtIssued - year.totalDividends);
      expect(year.netChangeInCash).toBeCloseTo(
        year.cashFromOperations + year.cashFromInvesting + year.cashFromFinancing,
        9,
      );
      expect(year.beginningCash).toBe(beginningCash);
      expect(year.endingCash).toBeCloseTo(year.beginningCash + year.netChangeInCash, 9);
      expect(year.cash).toBe(year.endingCash);
      beginningCash = year.endingCash;
      previousDebt = year.longTermDebt;
    });
  });

  it("rolls retained earnings and rebuilds book value / total equity", () => {
    let retainedEarnings = input.openingRetainedEarnings;
    result.years.forEach((year, i) => {
      const y = input.years[i]!;
      retainedEarnings = retainedEarnings + y.netIncome - y.totalDividends;
      expect(year.retainedEarnings).toBeCloseTo(retainedEarnings, 9);
      expect(year.bookValueOfEquity).toBeCloseTo(
        input.commonEquity + year.retainedEarnings + input.bookValueResidual,
        9,
      );
      expect(year.totalEquity).toBeCloseTo(year.bookValueOfEquity + input.minorityInterest, 9);
    });
  });

  it("holds current-portion LT debt at 0 and parks all debt in long-term debt", () => {
    for (const year of result.years) {
      expect(year.currentPortionLTDebt).toBe(0);
      expect(year.longTermDebt).toBe(input.years[year.year - 1]!.debt);
    }
  });

  it("holds the flagged balance-sheet lines flat at FY25", () => {
    for (const year of result.years) {
      expect(year.shortTermInvestments).toBe(input.shortTermInvestments);
      expect(year.tradingAssetSecurities).toBe(input.tradingAssetSecurities);
      expect(year.otherCurrentAssets).toBe(input.otherCurrentAssets);
      expect(year.longTermInvestments).toBe(input.longTermInvestments);
      expect(year.goodwill).toBe(input.goodwill);
      expect(year.intangibles).toBe(input.intangibles);
      expect(year.otherLTAssets).toBe(input.otherLTAssets);
      expect(year.currentLeases).toBe(input.currentLeases);
      expect(year.taxesPayable).toBe(input.taxesPayable);
      expect(year.longTermLeases).toBe(input.longTermLeases);
      expect(year.pensionOPEB).toBe(input.pensionOPEB);
      expect(year.deferredTaxLiability).toBe(input.deferredTaxLiability);
      expect(year.otherNonCurrentLiabilities).toBe(input.otherNonCurrentLiabilities);
      expect(year.commonEquity).toBe(input.commonEquity);
      expect(year.minorityInterest).toBe(input.minorityInterest);
    }
  });

  it("sums totalAssets and totalLiabilities from their component lines", () => {
    for (const year of result.years) {
      const assets =
        year.cash +
        year.shortTermInvestments +
        year.tradingAssetSecurities +
        year.receivables +
        year.inventory +
        year.prepaid +
        year.otherCurrentAssets +
        year.netPPE +
        year.longTermInvestments +
        year.goodwill +
        year.intangibles +
        year.otherLTAssets;
      expect(year.totalAssets).toBeCloseTo(assets, 9);
      const liabilities =
        year.accountsPayable +
        year.accrued +
        year.currentPortionLTDebt +
        year.currentLeases +
        year.taxesPayable +
        year.unearnedRevenue +
        year.otherCurrentLiabilities +
        year.longTermDebt +
        year.longTermLeases +
        year.pensionOPEB +
        year.deferredTaxLiability +
        year.otherNonCurrentLiabilities;
      expect(year.totalLiabilities).toBeCloseTo(liabilities, 9);
    }
  });

  it("rejects an empty years array", () => {
    expect(() => buildBalanceSheetCashFlowForecast({ ...input, years: [] })).toThrow(RangeError);
  });

  it("rejects a negative base total debt", () => {
    expect(() =>
      buildBalanceSheetCashFlowForecast({ ...input, baseTotalDebt: -1 }),
    ).toThrow(RangeError);
  });

  it("rejects negative capex on a forecast year", () => {
    const brokenYears = input.years.map((y, i) =>
      i === 0 ? { ...y, capitalExpenditure: -1 } : y,
    );
    expect(() =>
      buildBalanceSheetCashFlowForecast({ ...input, years: brokenYears }),
    ).toThrow(RangeError);
  });
});
