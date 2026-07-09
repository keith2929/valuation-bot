// Tier-1 unit tests for the assumption-derivation helpers (src/forecast.ts).
//
// Each derived assumption is checked to within ABSOLUTE_TOLERANCE against a
// value independently computed from the SIA fixture (see
// fixtures/siaAssumptions.ts and its provenance notes).

import { describe, expect, it } from "vitest";

import {
  daysOutstanding,
  deriveOperatingAssumptions,
  grossPpeToSalesRatio,
  percentOf,
  trailingAverage,
  trailingDaysOutstanding,
  trailingPercentOf,
} from "../src/forecast";
import { SIA_FINANCIALS, SIA_GROSS_PPE } from "./fixtures/siaAssumptions";

const ABSOLUTE_TOLERANCE = 1e-9;

function expectClose(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThanOrEqual(
    ABSOLUTE_TOLERANCE,
  );
}

describe("daysOutstanding / percentOf / trailingAverage (tier 1, single-period primitives)", () => {
  it("daysOutstanding scales a single-period ratio to 365 days", () => {
    expect(daysOutstanding(100, 1000)).toBeCloseTo(36.5, 12);
  });

  it("percentOf is a plain ratio", () => {
    expect(percentOf(50, 200)).toBe(0.25);
  });

  it("trailingAverage is the arithmetic mean", () => {
    expect(trailingAverage([1, 2, 3, 4])).toBe(2.5);
  });

  it("trailingAverage rejects an empty array", () => {
    expect(() => trailingAverage([])).toThrow(RangeError);
  });

  it("trailingPercentOf averages the trailing-window per-year ratios", () => {
    const line = [10, 20, 30, 40, 50];
    const base = [100, 100, 100, 100, 100];
    expect(trailingPercentOf(line, base, 2)).toBeCloseTo(0.45, 12);
  });

  it("trailingDaysOutstanding averages the trailing-window per-year days", () => {
    const line = [10, 20];
    const base = [100, 100];
    expect(trailingDaysOutstanding(line, base, 2)).toBeCloseTo(daysOutstanding(15, 100), 9);
  });
});

describe("deriveOperatingAssumptions (tier 2, SIA fixture)", () => {
  const assumptions = deriveOperatingAssumptions(SIA_FINANCIALS);

  it("derives COGS % revenue as the FY22-25 trailing average", () => {
    expectClose(assumptions.cogsPctRevenue, 0.66639561517925916, "cogsPctRevenue");
  });

  it("derives SG&A % revenue as the FY23-25 trailing average", () => {
    expectClose(assumptions.sgaPctRevenue, 0.043623724688156139, "sgaPctRevenue");
  });

  it("derives other opex % revenue from FY25 alone", () => {
    expectClose(assumptions.otherOpExPctRevenue, 0.066157278989549539, "otherOpExPctRevenue");
  });

  it("derives receivables days off revenue as the FY23-25 trailing average", () => {
    expectClose(assumptions.receivablesDays, 32.299461405959685, "receivablesDays");
  });

  it("derives inventory days off COGS as the FY23-25 trailing average", () => {
    expectClose(assumptions.inventoryDaysOfCogs, 8.2722479066195209, "inventoryDaysOfCogs");
  });

  it("derives prepaid days off COGS as the FY23-25 trailing average", () => {
    expectClose(assumptions.prepaidDaysOfCogs, 3.6665634624113763, "prepaidDaysOfCogs");
  });

  it("derives AP days off COGS as the FY23-25 trailing average", () => {
    expectClose(assumptions.accountsPayableDaysOfCogs, 126.1149572517068, "accountsPayableDaysOfCogs");
  });

  it("derives accrued days off COGS as the FY23-25 trailing average", () => {
    expectClose(assumptions.accruedDaysOfCogs, 1.7480976187394741, "accruedDaysOfCogs");
  });

  it("derives unearned revenue % revenue as the FY23-25 trailing average", () => {
    expectClose(assumptions.unearnedRevenuePctRevenue, 0.30459015762848263, "unearnedRevenuePctRevenue");
  });

  it("derives other current liabilities % of total current liabilities", () => {
    expectClose(
      assumptions.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities,
      0.064014576924195862,
      "otherCurrentLiabilitiesPctOfTotalCurrentLiabilities",
    );
  });

  it("derives the D&A rate on average FY24-25 net PPE", () => {
    expectClose(assumptions.depreciationRateOnNetPPE, 0.11097728960976208, "depreciationRateOnNetPPE");
  });

  it("derives target debt-to-equity as the FY21-25 average", () => {
    expectClose(assumptions.targetDebtToEquity, 0.61401244167979208, "targetDebtToEquity");
  });

  it("derives the interest rate on debt off average debt balances, FY23-25 trailing average", () => {
    expectClose(assumptions.interestRateOnDebt, 0.038806940388022411, "interestRateOnDebt");
  });

  it("derives the yield on cash + short-term investments, FY23-25 trailing average", () => {
    expectClose(
      assumptions.yieldOnCashAndShortTermInvestments,
      0.042897306362214803,
      "yieldOnCashAndShortTermInvestments",
    );
  });

  it("derives the payout ratio as the FY24-25 trailing average", () => {
    expectClose(assumptions.payoutRatio, 0.46843155912264567, "payoutRatio");
  });

  it("throws when fewer than 5 fiscal years of history are supplied", () => {
    const truncated = {
      ...SIA_FINANCIALS,
      fiscalYears: SIA_FINANCIALS.fiscalYears.slice(1),
    };
    expect(() => deriveOperatingAssumptions(truncated)).toThrow(RangeError);
  });
});

describe("grossPpeToSalesRatio (tier 2, SIA fixture)", () => {
  it("derives gross PPE / sales from average FY24-25 gross PPE over FY25 revenue", () => {
    const ratio = grossPpeToSalesRatio(SIA_GROSS_PPE, SIA_FINANCIALS.incomeStatement.revenue);
    expectClose(ratio, 1.6697867941330005, "grossPpeToSalesRatio");
  });
});
