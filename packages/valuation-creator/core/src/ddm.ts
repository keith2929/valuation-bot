// Dividend discount model (DDM), reproducing the Excel "DDM" sheet.
//
// Values equity as the present value of the dividends a company pays,
// discounted at the cost of equity (dividends accrue to shareholders, so the
// equity rate applies -- not WACC).
//
// Dividends are modelled in aggregate (e.g. SGD millions), not per share,
// driven off net income:
//
//   totalDividends_t = payoutRatio * netIncome_t
//
// payoutRatio is fixed at the average of the last two historical years'
// aggregate dividends paid over aggregate net income:
//
//   payoutRatio_y = totalDividendsPaid_y / netIncome_y
//   payoutRatio   = (payoutRatio_{-1} + payoutRatio_{-2}) / 2
//
// A schedule of special dividends per share (e.g. a disposal payout) can be
// declared for specific forecast years. Specials are carved OUT of the total
// computed above -- they are not additive on top of it -- splitting the
// total into a recurring "common" component and a one-off "special"
// component:
//
//   specialDividends_t = specialDividendPerShare_t * sharesOutstanding
//   commonDividends_t  = totalDividends_t - specialDividends_t
//
// Dividends are modelled as paid mid-year, matching the mid-year convention
// used for FCFF in dcf.ts, so the discount periods are 0.5, 1.5, ..., N-0.5:
//
//   PV(totalDividends_t) = totalDividends_t / (1 + Ke)^(t - 0.5)
//
// The terminal value grows the FINAL forecast year's total dividend (whatever
// mix of common/special it happens to contain) in perpetuity and discounts it
// over the same N - 0.5 periods as the final explicit year:
//
//   TV = totalDividends_N * (1 + g) / (Ke - g)
//
//   equityValue  = sum(PV(totalDividends_t)) + PV(TV)     [aggregate]
//   impliedPrice = equityValue / sharesOutstanding

export interface HistoricalPayoutYear {
  /** Optional label (e.g. "FY2024"), carried through for traceability. */
  name?: string;
  /** Aggregate dividends paid for the year (e.g. SGD m); must be >= 0. */
  totalDividendsPaid: number;
  /** Aggregate net income for the year (e.g. SGD m); must be > 0. */
  netIncome: number;
}

export interface HistoricalPayoutRatio {
  name?: string;
  totalDividendsPaid: number;
  netIncome: number;
  /** totalDividendsPaid / netIncome. */
  payoutRatio: number;
}

export interface PayoutRatioResult {
  /** The last two historical years with their computed payout ratios. */
  years: HistoricalPayoutRatio[];
  /** Simple average of the last two years' payout ratios. */
  averagePayoutRatio: number;
}

export interface DdmInput {
  /**
   * Historical years ordered oldest to newest; must contain at least 2.
   * Only the last two entries feed the payout-ratio average.
   */
  history: readonly HistoricalPayoutYear[];
  /**
   * Forecast net income for years 1..N, aggregate (e.g. SGD m); must be
   * non-empty.
   */
  forecastNetIncome: readonly number[];
  /** Shares outstanding (millions); must be > 0. */
  sharesOutstanding: number;
  /**
   * Special dividends per share by forecast year, aligned to
   * `forecastNetIncome` (index 0 = year 1). May be shorter than the forecast
   * (remaining years default to 0) but not longer. Each entry must be >= 0.
   * Defaults to no specials.
   */
  specialDividendsPerShare?: readonly number[];
  /** Cost of equity as a decimal (e.g. from CAPM, see wacc.ts); must be > 0. */
  costOfEquity: number;
  /** Perpetuity growth rate for dividends; must be < costOfEquity. */
  terminalGrowthRate: number;
}

export interface DdmYear {
  /** 1-based forecast year. */
  year: number;
  /** Forecast net income, echoed from the input. */
  netIncome: number;
  /** payoutRatio * netIncome (aggregate; includes any special component). */
  totalDividends: number;
  /** specialDividendPerShare_t * sharesOutstanding (0 if none scheduled). */
  specialDividends: number;
  /** totalDividends - specialDividends. */
  commonDividends: number;
  /** Mid-year discount period: t = year - 0.5. */
  discountPeriod: number;
  /** 1 / (1 + Ke)^discountPeriod. */
  discountFactor: number;
  /** totalDividends * discountFactor. */
  presentValue: number;
}

export interface DdmTerminalValue {
  /** Undiscounted TV as of the end of year N, grown off totalDividends_N. */
  terminalValue: number;
  /** Periods the terminal value is discounted over (N - 0.5). */
  discountPeriod: number;
  /** 1 / (1 + Ke)^discountPeriod. */
  discountFactor: number;
  /** terminalValue * discountFactor. */
  presentValueOfTerminalValue: number;
}

export interface DdmResult {
  /** Payout-ratio derivation from the last two historical years. */
  payout: PayoutRatioResult;
  /** Per-year dividend build and discounting detail. */
  years: DdmYear[];
  /** Sum of the explicit-period present values. */
  presentValueOfDividends: number;
  /** Gordon Growth terminal value detail. */
  terminal: DdmTerminalValue;
  /** Share of value contributed by the terminal value. */
  terminalValueShareOfValue: number;
  /** PV of forecast dividends plus PV of terminal value, aggregate. */
  equityValue: number;
  /** equityValue / sharesOutstanding. */
  impliedPrice: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

/**
 * Payout ratio from the last two historical years:
 * average of totalDividendsPaid / netIncome, year by year.
 *
 * `history` is ordered oldest to newest; entries before the last two are
 * ignored. Throws RangeError if fewer than 2 years are supplied or any year
 * has netIncome <= 0 or totalDividendsPaid < 0.
 */
export function averagePayoutRatio(history: readonly HistoricalPayoutYear[]): PayoutRatioResult {
  if (history.length < 2) {
    throw new RangeError(
      `averagePayoutRatio requires at least 2 historical years, got ${history.length}`,
    );
  }
  const years = history.slice(-2).map((year, i) => {
    const label = year.name ?? `history[${history.length - 2 + i}]`;
    assertFinite(year.totalDividendsPaid, `${label} totalDividendsPaid`);
    assertFinite(year.netIncome, `${label} netIncome`);
    if (year.totalDividendsPaid < 0) {
      throw new RangeError(
        `${label} totalDividendsPaid must be >= 0, got ${year.totalDividendsPaid}`,
      );
    }
    if (year.netIncome <= 0) {
      throw new RangeError(`${label} netIncome must be > 0, got ${year.netIncome}`);
    }
    return {
      ...(year.name !== undefined ? { name: year.name } : {}),
      totalDividendsPaid: year.totalDividendsPaid,
      netIncome: year.netIncome,
      payoutRatio: year.totalDividendsPaid / year.netIncome,
    };
  });
  return {
    years,
    averagePayoutRatio: (years[0]!.payoutRatio + years[1]!.payoutRatio) / 2,
  };
}

/**
 * Full DDM pass:
 * 1. Payout ratio = average of the last two historical years' aggregate
 *    dividends paid / net income.
 * 2. Total dividends_t = payoutRatio * forecast net income_t.
 * 3. Special dividends_t = special DPS scheduled for the year * shares
 *    outstanding, carved OUT of the total (not additive).
 * 4. Discount each year's TOTAL dividends at the cost of equity over
 *    mid-year periods t = 0.5, 1.5, ..., N - 0.5.
 * 5. Gordon Growth terminal value on the final year's TOTAL dividends,
 *    discounted over the same N - 0.5 periods as the final explicit year.
 * 6. equityValue = PV(dividends) + PV(terminal value); impliedPrice =
 *    equityValue / sharesOutstanding.
 *
 * Throws RangeError if the forecast is empty, the special schedule is longer
 * than the forecast, or any input is out of range.
 */
export function ddm(input: DdmInput): DdmResult {
  if (input.forecastNetIncome.length === 0) {
    throw new RangeError("ddm requires at least one forecast year of net income");
  }
  assertFinite(input.sharesOutstanding, "sharesOutstanding");
  if (input.sharesOutstanding <= 0) {
    throw new RangeError(`sharesOutstanding must be > 0, got ${input.sharesOutstanding}`);
  }
  assertFinite(input.costOfEquity, "costOfEquity");
  if (input.costOfEquity <= 0) {
    throw new RangeError(`costOfEquity must be > 0, got ${input.costOfEquity}`);
  }
  assertFinite(input.terminalGrowthRate, "terminalGrowthRate");
  if (input.terminalGrowthRate >= input.costOfEquity) {
    throw new RangeError(
      `terminalGrowthRate (${input.terminalGrowthRate}) must be < costOfEquity (${input.costOfEquity})`,
    );
  }

  const specials = input.specialDividendsPerShare ?? [];
  if (specials.length > input.forecastNetIncome.length) {
    throw new RangeError(
      `specialDividendsPerShare has ${specials.length} entries but the forecast only has ` +
        `${input.forecastNetIncome.length} years`,
    );
  }
  specials.forEach((special, i) => {
    assertFinite(special, `specialDividendsPerShare[${i}]`);
    if (special < 0) {
      throw new RangeError(`specialDividendsPerShare[${i}] must be >= 0, got ${special}`);
    }
  });

  const payout = averagePayoutRatio(input.history);

  const years: DdmYear[] = input.forecastNetIncome.map((netIncome, i) => {
    const year = i + 1;
    assertFinite(netIncome, `forecastNetIncome[${i}]`);
    const totalDividends = payout.averagePayoutRatio * netIncome;
    const specialDividends = (specials[i] ?? 0) * input.sharesOutstanding;
    const commonDividends = totalDividends - specialDividends;
    const discountPeriod = year - 0.5;
    const discountFactor = 1 / Math.pow(1 + input.costOfEquity, discountPeriod);
    return {
      year,
      netIncome,
      totalDividends,
      specialDividends,
      commonDividends,
      discountPeriod,
      discountFactor,
      presentValue: totalDividends * discountFactor,
    };
  });

  const presentValueOfDividends = years.reduce((sum, y) => sum + y.presentValue, 0);
  const horizon = years.length;
  // Non-empty by the guard above, so the final year always exists.
  const finalTotalDividends = years[horizon - 1]!.totalDividends;

  const terminalValue =
    (finalTotalDividends * (1 + input.terminalGrowthRate)) /
    (input.costOfEquity - input.terminalGrowthRate);
  const terminalDiscountPeriod = horizon - 0.5;
  const terminalDiscountFactor = 1 / Math.pow(1 + input.costOfEquity, terminalDiscountPeriod);
  const terminal: DdmTerminalValue = {
    terminalValue,
    discountPeriod: terminalDiscountPeriod,
    discountFactor: terminalDiscountFactor,
    presentValueOfTerminalValue: terminalValue * terminalDiscountFactor,
  };

  const equityValue = presentValueOfDividends + terminal.presentValueOfTerminalValue;

  return {
    payout,
    years,
    presentValueOfDividends,
    terminal,
    terminalValueShareOfValue:
      equityValue === 0 ? 0 : terminal.presentValueOfTerminalValue / equityValue,
    equityValue,
    impliedPrice: equityValue / input.sharesOutstanding,
  };
}
