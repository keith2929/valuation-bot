// WACC build test — masterprompt §2.4 / §6.2 / §6.3 / §6.7.
//
// Test tiers in this package:
// - Tier 1 (first block): pure-function unit tests of the two optional
//   derivations §2.4 adds on top of the direct inputs — `preTaxKd =
//   interestExpense / marketValueOfDebt` and `E = sharesOutstanding *
//   currentPrice` — including that a direct input still takes precedence
//   when both are supplied.
// - Tier 2 (second block): a layer test that runs `wacc()` against SIA's
//   §6.2 market data and §6.3 assumptions and reproduces the documented
//   cost of equity, after-tax cost of debt, and WACC (§6.7).
//
// The relevered equity beta (0.6868) is proven independently in
// hamada.test.ts from the §6.4 peer set; it is not re-derived here. Instead
// the peer passed to `wacc()` is a single proxy whose own D/E and tax rate
// equal the target's, so unlevering and relevering are inverse operations
// that cancel out — the Hamada average is a no-op and the relevered beta
// comes out to exactly the input, isolating the CAPM/weights math this test
// is actually checking.

import { describe, expect, it } from "vitest";

import { wacc, type WaccInput } from "../src/wacc";

/** ±0.5% relative tolerance, per §6.7. */
const RELATIVE_TOLERANCE = 0.005;

function expectWithinTolerance(actual: number, expected: number, label: string): void {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(
    relativeError,
    `${label}: expected ${expected} within ±${RELATIVE_TOLERANCE * 100}%, got ${actual} (rel err ${relativeError})`,
  ).toBeLessThan(RELATIVE_TOLERANCE);
}

describe("WACC optional derivations (tier 1, §2.4)", () => {
  const basePeer = { name: "proxy", equityBeta: 1.0, debtToEquity: 0.5, taxRate: 0.2 };

  it("derives preTaxCostOfDebt = interestExpense / marketValueOfDebt when not given directly", () => {
    const result = wacc({
      peers: [basePeer],
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      interestExpense: 389.9,
      taxRate: 0.17,
      marketValueOfEquity: 20000,
      marketValueOfDebt: 9510.7,
    });
    expect(result.preTaxCostOfDebt).toBeCloseTo(389.9 / 9510.7, 10);
    expectWithinTolerance(result.preTaxCostOfDebt, 0.041, "preTaxCostOfDebt derived from interestExpense");
  });

  it("prefers a direct preTaxCostOfDebt over interestExpense when both are given", () => {
    const result = wacc({
      peers: [basePeer],
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      preTaxCostOfDebt: 0.05,
      interestExpense: 389.9,
      taxRate: 0.17,
      marketValueOfEquity: 20000,
      marketValueOfDebt: 9510.7,
    });
    expect(result.preTaxCostOfDebt).toBe(0.05);
  });

  it("derives marketValueOfEquity = sharesOutstanding * currentPrice when not given directly", () => {
    const result = wacc({
      peers: [basePeer],
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      preTaxCostOfDebt: 0.045,
      taxRate: 0.17,
      sharesOutstanding: 3151.9,
      currentPrice: 6.49,
      marketValueOfDebt: 9510.7,
    });
    expect(result.marketValueOfEquity).toBeCloseTo(3151.9 * 6.49, 10);
  });

  it("prefers a direct marketValueOfEquity over sharesOutstanding * currentPrice when both are given", () => {
    const result = wacc({
      peers: [basePeer],
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      preTaxCostOfDebt: 0.045,
      taxRate: 0.17,
      marketValueOfEquity: 20000,
      sharesOutstanding: 3151.9,
      currentPrice: 6.49,
      marketValueOfDebt: 9510.7,
    });
    expect(result.marketValueOfEquity).toBe(20000);
  });
});

describe("SIA WACC build reproduces the reference anchors (tier 2, §6.2/§6.3/§6.7)", () => {
  // §6.2: E = sharesOutstanding * currentPrice = 3151.9 * 6.49 = 20455.831;
  // marketValueOfDebt = 9510.7.
  // §6.3: riskFreeRate 0.0197, marketRiskPremium 0.0783, preTaxCostOfDebt
  // 0.041, taxRate 0.17.
  const siaWaccInput: WaccInput = {
    peers: [
      // See file header: D/E and tax equal the target's, so this peer's
      // asset-beta unlever/relever round-trip is a no-op and the relevered
      // beta below comes out to exactly 0.6868, the value hamada.test.ts
      // independently derives from the §6.4 peer set.
      { name: "relevered-beta proxy", equityBeta: 0.6868, debtToEquity: 9510.7 / 20455.831, taxRate: 0.17 },
    ],
    riskFreeRate: 0.0197,
    equityRiskPremium: 0.0783,
    preTaxCostOfDebt: 0.041,
    taxRate: 0.17,
    sharesOutstanding: 3151.9,
    currentPrice: 6.49,
    marketValueOfDebt: 9510.7,
  };

  const result = wacc(siaWaccInput);

  it("derives E = sharesOutstanding * currentPrice = 20455.831", () => {
    expect(result.marketValueOfEquity).toBeCloseTo(20455.831, 3);
  });

  it("relevers the equity beta to 0.6868", () => {
    expectWithinTolerance(result.equityBeta, 0.6868, "relevered equity beta");
  });

  it("costs equity at Ke = 7.35% via CAPM", () => {
    expectWithinTolerance(result.costOfEquity, 0.0735, "cost of equity");
  });

  it("costs debt after tax at 3.4%", () => {
    expectWithinTolerance(result.afterTaxCostOfDebt, 0.034, "after-tax cost of debt");
  });

  it("blends to a WACC of 6.1%", () => {
    expectWithinTolerance(result.wacc, 0.061, "WACC");
  });
});
