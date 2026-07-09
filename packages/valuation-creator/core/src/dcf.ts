// Discounted cash flow (DCF) with the mid-year convention.
//
// Free cash flow to the firm (FCFF) arrives throughout the year, not as a
// lump sum on 31 December. The mid-year convention approximates this by
// discounting each forecast year's cash flow as if it were received at the
// middle of the year, so the discount periods are 0.5, 1.5, 2.5, ...:
//
//   PV(FCF_t) = FCF_t / (1 + r)^(t - 0.5)
//
// Terminal value is computed under BOTH standard methods:
//
// 1. Gordon Growth (perpetuity growth):
//
//      TV = FCF_N * (1 + g) / (r - g)
//
//    The perpetuity is itself a stream of mid-year cash flows, so its value
//    is discounted back over N - 0.5 periods, consistent with the explicit
//    forecast.
//
// 2. Exit Multiple:
//
//      TV = exitMultiple * terminalMetric   (e.g. EV/EBITDA * terminal EBITDA)
//
//    The terminal value crystallises at the end of the explicit forecast, so
//    it is discounted back over the final-period factor, N - 0.5 periods,
//    identical to the Gordon Growth path.
//
// Enterprise value is the PV of the explicit forecast plus the PV of the
// terminal value. It is bridged to equity value and value per share:
//
//   equityValue = EV - netDebt - minorityInterest - preferredEquity
//                    + nonOperatingAssets
//   valuePerShare = equityValue / sharesOutstanding
//
// Upside compares the implied value per share against the current market
// price:
//
//   upside = valuePerShare / currentPrice - 1

export type TerminalValueMethod = "gordonGrowth" | "exitMultiple";

export interface EquityBridgeInput {
  /** Net debt (total debt minus cash and equivalents); may be negative. */
  netDebt: number;
  /** Minority (non-controlling) interest to deduct; defaults to 0. */
  minorityInterest?: number;
  /** Preferred equity to deduct; defaults to 0. */
  preferredEquity?: number;
  /** Non-operating assets to add back (e.g. investments); defaults to 0. */
  nonOperatingAssets?: number;
  /** Diluted shares outstanding; must be > 0. */
  sharesOutstanding: number;
}

export interface DcfInput extends EquityBridgeInput {
  /** FCFF forecast for years 1..N, in currency units; must be non-empty. */
  freeCashFlows: readonly number[];
  /** Discount rate (WACC for FCFF) as a decimal; must be > 0. */
  discountRate: number;
  /** Gordon Growth perpetuity rate as a decimal; must be < discountRate. */
  terminalGrowthRate: number;
  /** Exit multiple, e.g. 8 for 8.0x EV/EBITDA; must be >= 0. */
  exitMultiple: number;
  /**
   * Terminal-year value of the metric the exit multiple applies to
   * (e.g. year-N EBITDA); must be >= 0.
   */
  terminalMetric: number;
  /** Current market price per share, used to compute upside; must be > 0. */
  currentPrice: number;
}

export interface DcfYear {
  /** 1-based forecast year. */
  year: number;
  /** FCFF for the year, echoed from the input. */
  freeCashFlow: number;
  /** Mid-year discount period: year - 0.5. */
  discountPeriod: number;
  /** 1 / (1 + r)^discountPeriod. */
  discountFactor: number;
  /** freeCashFlow * discountFactor. */
  presentValue: number;
}

export interface TerminalValueResult {
  method: TerminalValueMethod;
  /** Undiscounted terminal value as of the end of the forecast horizon. */
  terminalValue: number;
  /** Periods the terminal value is discounted over (N - 0.5). */
  discountPeriod: number;
  /** 1 / (1 + r)^discountPeriod. */
  discountFactor: number;
  /** terminalValue * discountFactor. */
  presentValueOfTerminalValue: number;
}

export interface DcfValuation {
  /** Terminal value detail for this method. */
  terminal: TerminalValueResult;
  /** PV of explicit forecast plus PV of terminal value. */
  enterpriseValue: number;
  /** Share of enterprise value contributed by the terminal value. */
  terminalValueShareOfEv: number;
  /** Enterprise value bridged to common equity. */
  equityValue: number;
  /** equityValue / sharesOutstanding. */
  equityValuePerShare: number;
  /** equityValuePerShare / currentPrice - 1. */
  upside: number;
}

export interface DcfResult {
  /** Per-year discounting detail for the explicit forecast. */
  years: DcfYear[];
  /** Sum of the explicit-period present values. */
  presentValueOfForecast: number;
  /** Valuation with the terminal value from the Gordon Growth method. */
  gordonGrowth: DcfValuation;
  /** Valuation with the terminal value from the Exit Multiple method. */
  exitMultiple: DcfValuation;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

/**
 * Present value of one cash flow under the mid-year convention:
 * PV = cashFlow / (1 + r)^(year - 0.5)
 */
export function midYearDiscountFactor(discountRate: number, year: number): number {
  assertFinite(discountRate, "discountRate");
  assertFinite(year, "year");
  if (discountRate <= 0) {
    throw new RangeError(`discountRate must be > 0, got ${discountRate}`);
  }
  if (year < 1) {
    throw new RangeError(`year must be >= 1, got ${year}`);
  }
  return 1 / Math.pow(1 + discountRate, year - 0.5);
}

/**
 * Gordon Growth terminal value as of the end of year N:
 * TV = finalFreeCashFlow * (1 + g) / (r - g)
 */
export function gordonGrowthTerminalValue(
  finalFreeCashFlow: number,
  discountRate: number,
  terminalGrowthRate: number,
): number {
  assertFinite(finalFreeCashFlow, "finalFreeCashFlow");
  assertFinite(discountRate, "discountRate");
  assertFinite(terminalGrowthRate, "terminalGrowthRate");
  if (terminalGrowthRate >= discountRate) {
    throw new RangeError(
      `terminalGrowthRate (${terminalGrowthRate}) must be < discountRate (${discountRate})`,
    );
  }
  return (finalFreeCashFlow * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
}

/**
 * Exit Multiple terminal value as of the end of year N:
 * TV = exitMultiple * terminalMetric
 */
export function exitMultipleTerminalValue(exitMultiple: number, terminalMetric: number): number {
  assertFinite(exitMultiple, "exitMultiple");
  assertFinite(terminalMetric, "terminalMetric");
  if (exitMultiple < 0) {
    throw new RangeError(`exitMultiple must be >= 0, got ${exitMultiple}`);
  }
  if (terminalMetric < 0) {
    throw new RangeError(`terminalMetric must be >= 0, got ${terminalMetric}`);
  }
  return exitMultiple * terminalMetric;
}

/**
 * Bridge enterprise value to common equity value:
 * equityValue = EV - netDebt - minorityInterest - preferredEquity + nonOperatingAssets
 */
export function enterpriseToEquityValue(enterpriseValue: number, bridge: EquityBridgeInput): number {
  assertFinite(enterpriseValue, "enterpriseValue");
  assertFinite(bridge.netDebt, "netDebt");
  const minorityInterest = bridge.minorityInterest ?? 0;
  const preferredEquity = bridge.preferredEquity ?? 0;
  const nonOperatingAssets = bridge.nonOperatingAssets ?? 0;
  assertFinite(minorityInterest, "minorityInterest");
  assertFinite(preferredEquity, "preferredEquity");
  assertFinite(nonOperatingAssets, "nonOperatingAssets");
  return (
    enterpriseValue - bridge.netDebt - minorityInterest - preferredEquity + nonOperatingAssets
  );
}

function valuation(
  terminal: TerminalValueResult,
  presentValueOfForecast: number,
  input: DcfInput,
): DcfValuation {
  const enterpriseValue = presentValueOfForecast + terminal.presentValueOfTerminalValue;
  const equityValue = enterpriseToEquityValue(enterpriseValue, input);
  const equityValuePerShare = equityValue / input.sharesOutstanding;
  return {
    terminal,
    enterpriseValue,
    terminalValueShareOfEv:
      enterpriseValue === 0 ? 0 : terminal.presentValueOfTerminalValue / enterpriseValue,
    equityValue,
    equityValuePerShare,
    upside: equityValuePerShare / input.currentPrice - 1,
  };
}

/**
 * Full DCF pass:
 * 1. Discount each forecast year's FCFF at mid-year periods 0.5, 1.5, ...
 * 2. Terminal value under Gordon Growth, discounted over N - 0.5 periods.
 * 3. Terminal value under Exit Multiple, discounted over N - 0.5 periods.
 * 4. Enterprise value = PV(forecast) + PV(terminal value), per method.
 * 5. Bridge each enterprise value to equity value and value per share.
 *
 * Throws RangeError if `freeCashFlows` is empty or any input is out of range.
 */
export function dcf(input: DcfInput): DcfResult {
  if (input.freeCashFlows.length === 0) {
    throw new RangeError("dcf requires at least one forecast year of free cash flow");
  }
  assertFinite(input.discountRate, "discountRate");
  if (input.discountRate <= 0) {
    throw new RangeError(`discountRate must be > 0, got ${input.discountRate}`);
  }
  assertFinite(input.sharesOutstanding, "sharesOutstanding");
  if (input.sharesOutstanding <= 0) {
    throw new RangeError(`sharesOutstanding must be > 0, got ${input.sharesOutstanding}`);
  }
  assertFinite(input.currentPrice, "currentPrice");
  if (input.currentPrice <= 0) {
    throw new RangeError(`currentPrice must be > 0, got ${input.currentPrice}`);
  }

  const years: DcfYear[] = input.freeCashFlows.map((freeCashFlow, i) => {
    const year = i + 1;
    assertFinite(freeCashFlow, `freeCashFlows[${i}]`);
    const discountPeriod = year - 0.5;
    const discountFactor = midYearDiscountFactor(input.discountRate, year);
    return {
      year,
      freeCashFlow,
      discountPeriod,
      discountFactor,
      presentValue: freeCashFlow * discountFactor,
    };
  });

  const presentValueOfForecast = years.reduce((sum, y) => sum + y.presentValue, 0);
  const horizon = years.length;
  // Non-empty by the guard above, so the final year always exists.
  const finalFreeCashFlow = years[horizon - 1]!.freeCashFlow;

  const gordonTv = gordonGrowthTerminalValue(
    finalFreeCashFlow,
    input.discountRate,
    input.terminalGrowthRate,
  );
  const gordonDiscountPeriod = horizon - 0.5;
  const gordonDiscountFactor = 1 / Math.pow(1 + input.discountRate, gordonDiscountPeriod);
  const gordonTerminal: TerminalValueResult = {
    method: "gordonGrowth",
    terminalValue: gordonTv,
    discountPeriod: gordonDiscountPeriod,
    discountFactor: gordonDiscountFactor,
    presentValueOfTerminalValue: gordonTv * gordonDiscountFactor,
  };

  const exitTv = exitMultipleTerminalValue(input.exitMultiple, input.terminalMetric);
  const exitDiscountPeriod = horizon - 0.5;
  const exitDiscountFactor = 1 / Math.pow(1 + input.discountRate, exitDiscountPeriod);
  const exitTerminal: TerminalValueResult = {
    method: "exitMultiple",
    terminalValue: exitTv,
    discountPeriod: exitDiscountPeriod,
    discountFactor: exitDiscountFactor,
    presentValueOfTerminalValue: exitTv * exitDiscountFactor,
  };

  return {
    years,
    presentValueOfForecast,
    gordonGrowth: valuation(gordonTerminal, presentValueOfForecast, input),
    exitMultiple: valuation(exitTerminal, presentValueOfForecast, input),
  };
}
