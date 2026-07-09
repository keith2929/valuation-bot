// Weighted average cost of capital (WACC).
//
// The discount rate for enterprise (FCFF) valuations blends the cost of each
// source of capital, weighted by its market value:
//
//   WACC = E/(D+E) * costOfEquity + D/(D+E) * costOfDebt * (1 - tax)
//
// The cost of equity comes from the CAPM, using an equity beta relevered to
// the target's capital structure via the Hamada equation (see hamada.ts):
//
//   costOfEquity = riskFree + equityBeta * equityRiskPremium
//
// Debt gets its tax shield applied because interest is deductible:
//
//   afterTaxCostOfDebt = preTaxCostOfDebt * (1 - tax)

import { hamadaBeta, type HamadaResult, type PeerBetaInput } from "./hamada";

export interface CapmInput {
  /** Risk-free rate as a decimal, e.g. 0.03 for 3%. */
  riskFreeRate: number;
  /** Equity (levered) beta, typically the relevered Hamada beta. */
  equityBeta: number;
  /** Equity risk premium (market return minus risk-free) as a decimal. */
  equityRiskPremium: number;
}

export interface WaccInput {
  /** Listed peers used to derive the target's beta via the Hamada equation. */
  peers: readonly PeerBetaInput[];
  /** Risk-free rate as a decimal, e.g. 0.03 for 3%. */
  riskFreeRate: number;
  /** Equity risk premium as a decimal, e.g. 0.05 for 5%. */
  equityRiskPremium: number;
  /**
   * Pre-tax cost of debt as a decimal, e.g. 0.06 for 6%. Takes precedence
   * over `interestExpense` when both are provided.
   */
  preTaxCostOfDebt?: number;
  /**
   * Interest expense used to derive `preTaxCostOfDebt = interestExpense /
   * marketValueOfDebt` when `preTaxCostOfDebt` is not given directly.
   */
  interestExpense?: number;
  /** Target marginal tax rate as a decimal in [0, 1). */
  taxRate: number;
  /**
   * Market value of equity; must be > 0. Takes precedence over
   * `sharesOutstanding * currentPrice` when both are provided.
   */
  marketValueOfEquity?: number;
  /**
   * Shares outstanding, used with `currentPrice` to derive
   * `marketValueOfEquity = sharesOutstanding * currentPrice` when
   * `marketValueOfEquity` is not given directly.
   */
  sharesOutstanding?: number;
  /** Current share price, paired with `sharesOutstanding` (see above). */
  currentPrice?: number;
  /** Market value of debt; must be >= 0. */
  marketValueOfDebt: number;
}

export interface WaccResult {
  /** Full Hamada pass over the peers, relevered to the target's D/E. */
  hamada: HamadaResult;
  /** Relevered equity beta used in the CAPM (same as hamada.releveredEquityBeta). */
  equityBeta: number;
  /** CAPM cost of equity. */
  costOfEquity: number;
  /** Market value of equity, resolved from the input. */
  marketValueOfEquity: number;
  /**
   * Pre-tax cost of debt, either echoed from the input or derived from
   * `interestExpense / marketValueOfDebt`.
   */
  preTaxCostOfDebt: number;
  /** Cost of debt net of the interest tax shield. */
  afterTaxCostOfDebt: number;
  /** E / (D + E), by market value. */
  weightOfEquity: number;
  /** D / (D + E), by market value. */
  weightOfDebt: number;
  /** Target debt-to-equity ratio (D/E) implied by the market values. */
  debtToEquity: number;
  /** Weighted average cost of capital. */
  wacc: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

function assertTaxRate(taxRate: number, label: string): void {
  assertFinite(taxRate, label);
  if (taxRate < 0 || taxRate >= 1) {
    throw new RangeError(`${label} must be in [0, 1), got ${taxRate}`);
  }
}

/**
 * CAPM cost of equity:
 * costOfEquity = riskFreeRate + equityBeta * equityRiskPremium
 */
export function costOfEquityCapm(input: CapmInput): number {
  assertFinite(input.riskFreeRate, "riskFreeRate");
  assertFinite(input.equityBeta, "equityBeta");
  assertFinite(input.equityRiskPremium, "equityRiskPremium");
  return input.riskFreeRate + input.equityBeta * input.equityRiskPremium;
}

/**
 * Cost of debt net of the interest tax shield:
 * afterTaxCostOfDebt = preTaxCostOfDebt * (1 - taxRate)
 */
export function afterTaxCostOfDebt(preTaxCostOfDebt: number, taxRate: number): number {
  assertFinite(preTaxCostOfDebt, "preTaxCostOfDebt");
  assertTaxRate(taxRate, "taxRate");
  return preTaxCostOfDebt * (1 - taxRate);
}

/**
 * Resolve the pre-tax cost of debt: the direct `preTaxCostOfDebt` input
 * takes precedence when provided, otherwise it is derived as
 * `interestExpense / marketValueOfDebt`.
 */
function resolvePreTaxCostOfDebt(input: WaccInput): number {
  if (input.preTaxCostOfDebt !== undefined) {
    assertFinite(input.preTaxCostOfDebt, "preTaxCostOfDebt");
    return input.preTaxCostOfDebt;
  }
  if (input.interestExpense !== undefined) {
    assertFinite(input.interestExpense, "interestExpense");
    if (input.marketValueOfDebt <= 0) {
      throw new RangeError(
        `marketValueOfDebt must be > 0 to derive preTaxCostOfDebt from interestExpense, got ${input.marketValueOfDebt}`,
      );
    }
    return input.interestExpense / input.marketValueOfDebt;
  }
  throw new RangeError("either preTaxCostOfDebt or interestExpense must be provided");
}

/**
 * Resolve the market value of equity: the direct `marketValueOfEquity`
 * input takes precedence when provided, otherwise it is derived as
 * `sharesOutstanding * currentPrice`.
 */
function resolveMarketValueOfEquity(input: WaccInput): number {
  if (input.marketValueOfEquity !== undefined) {
    assertFinite(input.marketValueOfEquity, "marketValueOfEquity");
    return input.marketValueOfEquity;
  }
  if (input.sharesOutstanding !== undefined && input.currentPrice !== undefined) {
    assertFinite(input.sharesOutstanding, "sharesOutstanding");
    assertFinite(input.currentPrice, "currentPrice");
    return input.sharesOutstanding * input.currentPrice;
  }
  throw new RangeError(
    "either marketValueOfEquity or both sharesOutstanding and currentPrice must be provided",
  );
}

/**
 * Full WACC pass:
 * 1. Resolve the market value of equity and the pre-tax cost of debt,
 *    each either taken directly from the input or derived (see above).
 * 2. Derive the target's D/E from the market values of debt and equity.
 * 3. Unlever the peer betas and relever the average to that D/E (Hamada).
 * 4. Cost of equity via CAPM on the relevered beta.
 * 5. After-tax cost of debt.
 * 6. Blend by market-value weights.
 *
 * Throws RangeError if `peers` is empty or any input is out of range.
 */
export function wacc(input: WaccInput): WaccResult {
  assertFinite(input.riskFreeRate, "riskFreeRate");
  assertFinite(input.equityRiskPremium, "equityRiskPremium");
  assertTaxRate(input.taxRate, "taxRate");
  assertFinite(input.marketValueOfDebt, "marketValueOfDebt");
  if (input.marketValueOfDebt < 0) {
    throw new RangeError(
      `marketValueOfDebt must be >= 0, got ${input.marketValueOfDebt}`,
    );
  }

  const preTaxCostOfDebt = resolvePreTaxCostOfDebt(input);
  const marketValueOfEquity = resolveMarketValueOfEquity(input);
  if (marketValueOfEquity <= 0) {
    throw new RangeError(`marketValueOfEquity must be > 0, got ${marketValueOfEquity}`);
  }

  const debtToEquity = input.marketValueOfDebt / marketValueOfEquity;
  const hamada = hamadaBeta(input.peers, { debtToEquity, taxRate: input.taxRate });
  const equityBeta = hamada.releveredEquityBeta;

  const costOfEquity = costOfEquityCapm({
    riskFreeRate: input.riskFreeRate,
    equityBeta,
    equityRiskPremium: input.equityRiskPremium,
  });
  const costOfDebt = afterTaxCostOfDebt(preTaxCostOfDebt, input.taxRate);

  const totalCapital = marketValueOfEquity + input.marketValueOfDebt;
  const weightOfEquity = marketValueOfEquity / totalCapital;
  const weightOfDebt = input.marketValueOfDebt / totalCapital;

  return {
    hamada,
    equityBeta,
    costOfEquity,
    marketValueOfEquity,
    preTaxCostOfDebt,
    afterTaxCostOfDebt: costOfDebt,
    weightOfEquity,
    weightOfDebt,
    debtToEquity,
    wacc: weightOfEquity * costOfEquity + weightOfDebt * costOfDebt,
  };
}
