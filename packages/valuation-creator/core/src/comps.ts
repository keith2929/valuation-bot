// Trading comparables (comps): peer market/EV multiples and the summary
// statistics (average / min / quartiles / median / max) run over them.
//
// Operates on the shared `PeerData` contract shape (@valuation-bot/contract):
// each peer's `currentPrice`/`sales`/`ebitda`/`ebit`/`earnings`/`bookValue`
// arrive already expressed in the target reporting currency, while
// `cashAndSTInvestments`/`totalDebt`/`preferredEquity`/`minorityInterest`
// arrive in the peer's own domestic currency and are converted via
// `fxToTargetCurrency` only when they feed the net-debt bridge from market
// cap to enterprise value.

import type { PeerData } from "@valuation-bot/contract";

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

/** A single peer's derived market-cap/EV and LTM/NTM trading multiples. */
export interface PeerMultiples {
  name: string;
  priceSGD: number;
  marketCap: number;
  ev: number;
  peLtm: number;
  pbLtm: number;
  evEbitdaLtm: number;
  peNtm: number;
  evEbitdaNtm: number;
}

/** Cross-sectional statistics for one multiple across the peer set. */
export interface MultipleStatistics {
  average: number;
  minimum: number;
  p25: number;
  median: number;
  p75: number;
  maximum: number;
}

/** Per-multiple statistics for the full comps build. */
export interface CompsResult {
  peers: PeerMultiples[];
  peLtm: MultipleStatistics;
  pbLtm: MultipleStatistics;
  evEbitdaLtm: MultipleStatistics;
  peNtm: MultipleStatistics;
  evEbitdaNtm: MultipleStatistics;
}

/**
 * Exclusive-quartile interpolation, i.e. Excel's `QUARTILE.EXC(range, k)` for
 * `p = k / 4` — NOT the inclusive `QUARTILE.INC`/`PERCENTILE` method. Position
 * `h = (n + 1) * p` (1-indexed) into the ascending-sorted values, linearly
 * interpolated between its floor and ceiling. Throws if `h` falls outside
 * `[1, n]`, matching `QUARTILE.EXC`'s `#NUM!` for too-small sample sizes.
 */
export function quartileExc(sortedAscending: readonly number[], p: number): number {
  const n = sortedAscending.length;
  const h = (n + 1) * p;
  if (h < 1 || h > n) {
    throw new RangeError(
      `QUARTILE.EXC position ${h} (p=${p}, n=${n}) is out of range [1, ${n}]`,
    );
  }
  const lowerIndex = Math.floor(h);
  const fraction = h - lowerIndex;
  const lower = sortedAscending[lowerIndex - 1]!;
  if (fraction === 0) {
    return lower;
  }
  const upper = sortedAscending[lowerIndex]!;
  return lower + fraction * (upper - lower);
}

/** Simple arithmetic mean of a non-empty array. */
function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Standard median (average of the two middle values for even-length input). */
function median(sortedAscending: readonly number[]): number {
  const n = sortedAscending.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (sortedAscending[mid - 1]! + sortedAscending[mid]!) / 2
    : sortedAscending[mid]!;
}

/**
 * Average / minimum / 25th percentile / median / 75th percentile / maximum
 * of a multiple across peers. Quartiles use `QUARTILE.EXC` semantics.
 */
export function computeStatistics(values: readonly number[]): MultipleStatistics {
  if (values.length === 0) {
    throw new RangeError("computeStatistics requires at least one value");
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    average: average(values),
    minimum: sorted[0]!,
    p25: quartileExc(sorted, 0.25),
    median: median(sorted),
    p75: quartileExc(sorted, 0.75),
    maximum: sorted[sorted.length - 1]!,
  };
}

/**
 * A single peer's market cap, EV, and trading multiples from its `PeerData`.
 *
 *   marketCap = currentPrice * sharesOutstanding
 *   EV        = marketCap + (-cashAndSTInvestments + totalDebt
 *                             + preferredEquity + minorityInterest) * fxToTargetCurrency
 *
 * NTM P/E and NTM EV/EBITDA are not derived — they are taken directly from
 * `ntmPE`/`ntmEvEbitda` (the LTM financials on `PeerData` don't carry
 * forward-looking earnings/EBITDA to divide through).
 */
export function peerMultiples(peer: PeerData): PeerMultiples {
  assertFinite(peer.currentPrice, `${peer.name} currentPrice`);
  assertFinite(peer.sharesOutstanding, `${peer.name} sharesOutstanding`);
  assertFinite(peer.fxToTargetCurrency, `${peer.name} fxToTargetCurrency`);

  const priceSGD = peer.currentPrice;
  const marketCap = priceSGD * peer.sharesOutstanding;
  const netDebt =
    -peer.cashAndSTInvestments + peer.totalDebt + peer.preferredEquity + peer.minorityInterest;
  const ev = marketCap + netDebt * peer.fxToTargetCurrency;

  return {
    name: peer.name,
    priceSGD,
    marketCap,
    ev,
    peLtm: marketCap / peer.earnings,
    pbLtm: marketCap / peer.bookValue,
    evEbitdaLtm: ev / peer.ebitda,
    peNtm: peer.ntmPE,
    evEbitdaNtm: peer.ntmEvEbitda,
  };
}

/** Build the full comps table: per-peer multiples plus cross-sectional statistics. */
export function buildComps(peers: readonly PeerData[]): CompsResult {
  if (peers.length === 0) {
    throw new RangeError("buildComps requires at least one peer");
  }
  const rows = peers.map(peerMultiples);
  return {
    peers: rows,
    peLtm: computeStatistics(rows.map((r) => r.peLtm)),
    pbLtm: computeStatistics(rows.map((r) => r.pbLtm)),
    evEbitdaLtm: computeStatistics(rows.map((r) => r.evEbitdaLtm)),
    peNtm: computeStatistics(rows.map((r) => r.peNtm)),
    evEbitdaNtm: computeStatistics(rows.map((r) => r.evEbitdaNtm)),
  };
}

/**
 * Target company's LTM/NTM financials and current share price, used to
 * translate a peer set's trading-multiple statistics (`CompsResult`) into
 * implied equity value / price / upside for the target itself.
 */
export interface TargetFinancials {
  currentPrice: number;
  sharesOutstanding: number;
  ltmEarnings: number;
  ltmBookValueOfEquity: number;
  ltmEbitda: number;
  ltmDebt: number;
  ltmCash: number;
  ntmEarnings: number;
  ntmEbitda: number;
  ntmDebt: number;
  ntmCash: number;
}

/** One multiple's implied valuation of the target: multiple in, price/upside out. */
export interface ImpliedValuation {
  multiple: number;
  equityValue: number;
  impliedPrice: number;
  upside: number;
}

/** `ImpliedValuation` computed at each of `MultipleStatistics`'s six summary points. */
export interface ImpliedValuationStatistics {
  average: ImpliedValuation;
  minimum: ImpliedValuation;
  p25: ImpliedValuation;
  median: ImpliedValuation;
  p75: ImpliedValuation;
  maximum: ImpliedValuation;
}

/** Per-multiple implied valuation of the target across the full comps build. */
export interface CompsImpliedValuation {
  peLtm: ImpliedValuationStatistics;
  pbLtm: ImpliedValuationStatistics;
  evEbitdaLtm: ImpliedValuationStatistics;
  peNtm: ImpliedValuationStatistics;
  evEbitdaNtm: ImpliedValuationStatistics;
}

const STATISTIC_KEYS = ["average", "minimum", "p25", "median", "p75", "maximum"] as const;

/**
 * Apply one `MultipleStatistics` set to the target: `equityFromMultiple`
 * derives equity value from each summary multiple (P/E and P/B multiply
 * straight through to equity; EV/EBITDA multiplies to EV and then bridges to
 * equity via net debt), `impliedPrice = equityValue / sharesOutstanding`, and
 * `upside = impliedPrice / currentPrice - 1`.
 */
function impliedValuationStatistics(
  stats: MultipleStatistics,
  target: TargetFinancials,
  equityFromMultiple: (multiple: number) => number,
): ImpliedValuationStatistics {
  const result = {} as { -readonly [K in (typeof STATISTIC_KEYS)[number]]: ImpliedValuation };
  for (const key of STATISTIC_KEYS) {
    const multiple = stats[key];
    const equityValue = equityFromMultiple(multiple);
    const impliedPrice = equityValue / target.sharesOutstanding;
    const upside = impliedPrice / target.currentPrice - 1;
    result[key] = { multiple, equityValue, impliedPrice, upside };
  }
  return result;
}

/**
 * Apply a peer comps build's cross-sectional statistics to a target company's
 * own LTM/NTM financials, producing implied equity value / price / upside at
 * each summary point (average/min/p25/median/p75/max) for every multiple:
 *
 *   LTM P/E:        equity = mult * ltmEarnings
 *   LTM P/B:        equity = mult * ltmBookValueOfEquity
 *   LTM EV/EBITDA:  EV = mult * ltmEbitda; equity = EV - ltmDebt + ltmCash
 *   NTM P/E:        equity = mult * ntmEarnings
 *   NTM EV/EBITDA:  EV = mult * ntmEbitda; equity = EV - ntmDebt + ntmCash
 *
 * Every implied price divides through by `target.sharesOutstanding`, and
 * every upside is `impliedPrice / target.currentPrice - 1`.
 */
export function applyCompsToTarget(
  comps: CompsResult,
  target: TargetFinancials,
): CompsImpliedValuation {
  return {
    peLtm: impliedValuationStatistics(comps.peLtm, target, (m) => m * target.ltmEarnings),
    pbLtm: impliedValuationStatistics(comps.pbLtm, target, (m) => m * target.ltmBookValueOfEquity),
    evEbitdaLtm: impliedValuationStatistics(
      comps.evEbitdaLtm,
      target,
      (m) => m * target.ltmEbitda - target.ltmDebt + target.ltmCash,
    ),
    peNtm: impliedValuationStatistics(comps.peNtm, target, (m) => m * target.ntmEarnings),
    evEbitdaNtm: impliedValuationStatistics(
      comps.evEbitdaNtm,
      target,
      (m) => m * target.ntmEbitda - target.ntmDebt + target.ntmCash,
    ),
  };
}

/**
 * Default DCF terminal-value exit multiple: the peer set's median LTM
 * EV/EBITDA (the standard "mid-of-market" comps-implied exit multiple).
 */
export function getDefaultDcfExitMultiple(comps: CompsResult): number {
  return comps.evEbitdaLtm.median;
}
