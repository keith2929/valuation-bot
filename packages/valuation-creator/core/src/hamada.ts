// Hamada beta unlevering / relevering.
//
// The Hamada equation relates the equity (levered) beta of a company to the
// asset (unlevered) beta of its business, given its capital structure:
//
//   equityBeta = assetBeta * (1 + (D/E) * (1 - tax))
//
// To estimate a beta for a target company from listed peers we unlever each
// peer's observed equity beta to strip out its own leverage, average the
// resulting asset betas (a pure business-risk measure), and relever that
// average to the target's capital structure.

export interface PeerBetaInput {
  /** Optional label, carried through to the result for traceability. */
  name?: string;
  /** Observed (levered) equity beta of the peer. */
  equityBeta: number;
  /** Peer debt-to-equity ratio (D/E), e.g. 0.5 for 50% debt to equity. */
  debtToEquity: number;
  /** Peer marginal tax rate as a decimal in [0, 1), e.g. 0.17 for 17%. */
  taxRate: number;
}

export interface TargetStructure {
  /** Target debt-to-equity ratio (D/E). */
  debtToEquity: number;
  /** Target marginal tax rate as a decimal in [0, 1). */
  taxRate: number;
}

export interface PeerAssetBeta {
  name?: string;
  equityBeta: number;
  debtToEquity: number;
  taxRate: number;
  assetBeta: number;
}

export interface HamadaResult {
  /** Each peer with its computed unlevered (asset) beta. */
  peers: PeerAssetBeta[];
  /** Simple average of the peer asset betas. */
  averageAssetBeta: number;
  /** Average asset beta relevered to the target's capital structure. */
  releveredEquityBeta: number;
}

/**
 * A peer described the way market data arrives (PeerData): a market equity
 * value and a debt balance rather than a pre-computed D/E ratio. The asset
 * beta is derived as
 *
 *   assetBeta = equityBeta5Y / (1 + (totalDebt / equityValue) * (1 - tax))
 *
 * `equityValue` must already be expressed in the target reporting currency
 * (i.e. converted via `fxToTargetCurrency` before it reaches this module) so
 * that it and `totalDebt` share units and the ratio is currency-neutral.
 */
export interface PeerValueBetaInput {
  /** Optional label, carried through to the result for traceability. */
  name?: string;
  /** Observed 5-year (levered) equity beta of the peer. */
  equityBeta5Y: number;
  /** Peer total debt, in the target reporting currency. */
  totalDebt: number;
  /** Peer market value of equity, already converted to the target currency. */
  equityValue: number;
  /** Peer marginal tax rate as a decimal in [0, 1), e.g. 0.17 for 17%. */
  marginalTaxRate: number;
  /**
   * When true the peer is treated as an outlier: its asset beta is still
   * reported for traceability but it is left out of the averaged asset beta.
   */
  excluded?: boolean;
}

export interface PeerValueAssetBeta {
  name?: string;
  equityBeta5Y: number;
  totalDebt: number;
  equityValue: number;
  marginalTaxRate: number;
  /** Derived debt-to-equity ratio, totalDebt / equityValue. */
  debtToEquity: number;
  /** Unlevered (asset) beta for this peer. */
  assetBeta: number;
  /** Whether this peer was excluded from the average (defaults to false). */
  excluded: boolean;
}

export interface HamadaFromPeersResult {
  /** Every peer with its derived D/E, asset beta, and exclusion flag. */
  peers: PeerValueAssetBeta[];
  /** Simple average of the asset betas of the *non-excluded* peers. */
  averageAssetBeta: number;
  /** Number of peers that contributed to the average. */
  includedCount: number;
  /** Average asset beta relevered to the target's capital structure. */
  releveredEquityBeta: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

function assertLeverageInputs(debtToEquity: number, taxRate: number, label: string): void {
  assertFinite(debtToEquity, `${label} debtToEquity`);
  assertFinite(taxRate, `${label} taxRate`);
  if (debtToEquity < 0) {
    throw new RangeError(`${label} debtToEquity must be >= 0, got ${debtToEquity}`);
  }
  if (taxRate < 0 || taxRate >= 1) {
    throw new RangeError(`${label} taxRate must be in [0, 1), got ${taxRate}`);
  }
}

/**
 * Unlever an observed equity beta to an asset beta:
 * assetBeta = equityBeta / (1 + (D/E) * (1 - tax))
 */
export function unleverBeta(equityBeta: number, debtToEquity: number, taxRate: number): number {
  assertFinite(equityBeta, "equityBeta");
  assertLeverageInputs(debtToEquity, taxRate, "peer");
  return equityBeta / (1 + debtToEquity * (1 - taxRate));
}

/**
 * Relever an asset beta to a given capital structure:
 * equityBeta = assetBeta * (1 + (D/E) * (1 - tax))
 */
export function releverBeta(assetBeta: number, debtToEquity: number, taxRate: number): number {
  assertFinite(assetBeta, "assetBeta");
  assertLeverageInputs(debtToEquity, taxRate, "target");
  return assetBeta * (1 + debtToEquity * (1 - taxRate));
}

/**
 * Full Hamada pass: unlever each peer's equity beta, average the asset betas,
 * and relever the average to the target's capital structure.
 *
 * Throws RangeError if `peers` is empty or any input is out of range.
 */
export function hamadaBeta(peers: readonly PeerBetaInput[], target: TargetStructure): HamadaResult {
  if (peers.length === 0) {
    throw new RangeError("hamadaBeta requires at least one peer");
  }

  const unlevered: PeerAssetBeta[] = peers.map((peer, i) => {
    const label = peer.name ?? `peer[${i}]`;
    assertFinite(peer.equityBeta, `${label} equityBeta`);
    assertLeverageInputs(peer.debtToEquity, peer.taxRate, label);
    const assetBeta = peer.equityBeta / (1 + peer.debtToEquity * (1 - peer.taxRate));
    return {
      ...(peer.name !== undefined ? { name: peer.name } : {}),
      equityBeta: peer.equityBeta,
      debtToEquity: peer.debtToEquity,
      taxRate: peer.taxRate,
      assetBeta,
    };
  });

  const averageAssetBeta =
    unlevered.reduce((sum, p) => sum + p.assetBeta, 0) / unlevered.length;

  const releveredEquityBeta = releverBeta(averageAssetBeta, target.debtToEquity, target.taxRate);

  return { peers: unlevered, averageAssetBeta, releveredEquityBeta };
}

/**
 * Unlever a peer given its market equity value and debt balance rather than a
 * pre-computed D/E:
 *
 *   assetBeta = equityBeta5Y / (1 + (totalDebt / equityValue) * (1 - tax))
 *
 * `equityValue` must be > 0 and already expressed in the target reporting
 * currency. Delegates to `unleverBeta` (the D/E form) so both code paths share
 * one definition of the Hamada unlevering.
 */
export function assetBetaFromValue(
  equityBeta5Y: number,
  totalDebt: number,
  equityValue: number,
  marginalTaxRate: number,
): number {
  assertFinite(totalDebt, "totalDebt");
  assertFinite(equityValue, "equityValue");
  if (equityValue <= 0) {
    throw new RangeError(`equityValue must be > 0, got ${equityValue}`);
  }
  return unleverBeta(equityBeta5Y, totalDebt / equityValue, marginalTaxRate);
}

/**
 * Hamada pass over peers shaped from PeerData: derive each peer's asset beta
 * from its market equity value and debt, average the asset betas of the peers
 * that are *not* flagged `excluded`, and relever that average to the target's
 * capital structure.
 *
 * Excluded peers are still returned in `peers` (with their asset beta) so the
 * caller can show the full comparison, but they do not move the average. This
 * is how outliers are dropped from the beta build.
 *
 * Throws RangeError if `peers` is empty, if every peer is excluded, or if any
 * input is out of range.
 */
export function hamadaBetaFromPeers(
  peers: readonly PeerValueBetaInput[],
  target: TargetStructure,
): HamadaFromPeersResult {
  if (peers.length === 0) {
    throw new RangeError("hamadaBetaFromPeers requires at least one peer");
  }

  const rows: PeerValueAssetBeta[] = peers.map((peer, i) => {
    const label = peer.name ?? `peer[${i}]`;
    assertFinite(peer.equityBeta5Y, `${label} equityBeta5Y`);
    assertFinite(peer.totalDebt, `${label} totalDebt`);
    assertFinite(peer.equityValue, `${label} equityValue`);
    if (peer.equityValue <= 0) {
      throw new RangeError(`${label} equityValue must be > 0, got ${peer.equityValue}`);
    }
    const debtToEquity = peer.totalDebt / peer.equityValue;
    const assetBeta = unleverBeta(peer.equityBeta5Y, debtToEquity, peer.marginalTaxRate);
    return {
      ...(peer.name !== undefined ? { name: peer.name } : {}),
      equityBeta5Y: peer.equityBeta5Y,
      totalDebt: peer.totalDebt,
      equityValue: peer.equityValue,
      marginalTaxRate: peer.marginalTaxRate,
      debtToEquity,
      assetBeta,
      excluded: peer.excluded ?? false,
    };
  });

  const included = rows.filter((r) => !r.excluded);
  if (included.length === 0) {
    throw new RangeError("hamadaBetaFromPeers requires at least one non-excluded peer");
  }

  const averageAssetBeta =
    included.reduce((sum, r) => sum + r.assetBeta, 0) / included.length;
  const releveredEquityBeta = releverBeta(
    averageAssetBeta,
    target.debtToEquity,
    target.taxRate,
  );

  return { peers: rows, averageAssetBeta, includedCount: included.length, releveredEquityBeta };
}
