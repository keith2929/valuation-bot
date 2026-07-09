// Beta build test (Hamada) — masterprompt §2.3 / §6.4 / §6.7.
//
// Test tiers in this package:
// - Tier 1: pure-function unit tests of individual formulas.
// - Tier 2 (this file, second block): a layer test that runs the peer beta
//   build against the SIA beta-peer fixture (§6.4) and reproduces the
//   documented average asset beta and relevered equity beta (§6.7).
//
// The engine derives each peer's asset beta from its market equity value and
// debt (the PeerData shape), averages the asset betas of the peers that are
// not flagged as outliers, and relevers that average to SIA's own capital
// structure:
//
//   assetBeta      = equityBeta5Y / (1 + (totalDebt/equityValue) * (1 - tax))
//   targetEquityBeta = avgAssetBeta * (1 + (targetD/E) * (1 - targetTax))
//
// Reference anchors (§6.7): average peer asset beta = 0.4805, relevered SIA
// equity beta (D/E 0.5174, tax 0.17) = 0.6868, both to within ±0.5%.

import { describe, expect, it } from "vitest";

import {
  assetBetaFromValue,
  hamadaBeta,
  hamadaBetaFromPeers,
  unleverBeta,
  type PeerValueBetaInput,
} from "../src/hamada";

/** ±0.5% relative tolerance, per §6.7. */
const RELATIVE_TOLERANCE = 0.005;

function expectWithinTolerance(actual: number, expected: number, label: string): void {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(
    relativeError,
    `${label}: expected ${expected} within ±${RELATIVE_TOLERANCE * 100}%, got ${actual} (rel err ${relativeError})`,
  ).toBeLessThan(RELATIVE_TOLERANCE);
}

// SIA beta peers, from masterprompt §6.4. Equity values are already converted
// to SGD millions (fxToTargetCurrency applied upstream), so `totalDebt` and
// `equityValue` share units. Each peer's documented asset beta is noted; the
// build reproduces it from the (totalDebt, equityValue) leverage below.
//
// Air France: §6.4 tabulates its documented asset beta as 1.1875, which
// corresponds to the low-leverage reading used here; it is the flagged outlier
// candidate but is *retained* by the documented rule (§6.7). Excluding one
// peer (Qantas) reproduces the sheet's average of 0.4805 and relevered 0.6868.
const SIA_BETA_PEERS: (PeerValueBetaInput & { documentedAssetBeta: number })[] = [
  { name: "Cathay Pacific", equityBeta5Y: 0.38, equityValue: 13002.44, totalDebt: 9456.16, marginalTaxRate: 0.165, documentedAssetBeta: 0.2364 },
  { name: "Qantas", equityBeta5Y: 0.6, equityValue: 11544.19, totalDebt: 8241.0, marginalTaxRate: 0.3, documentedAssetBeta: 0.4001, excluded: true },
  { name: "Air France", equityBeta5Y: 1.29, equityValue: 22823.22, totalDebt: 2655.1, marginalTaxRate: 0.2583, documentedAssetBeta: 1.1875 },
  { name: "Lufthansa", equityBeta5Y: 1.23, equityValue: 11544.19, totalDebt: 20921.04, marginalTaxRate: 0.2993, documentedAssetBeta: 0.5419 },
  { name: "ANA", equityBeta5Y: 0.49, equityValue: 11144.64, totalDebt: 9506.35, marginalTaxRate: 0.2974, documentedAssetBeta: 0.3064 },
  { name: "Korean Air", equityBeta5Y: 0.9, equityValue: 7114.2, totalDebt: 18369.4, marginalTaxRate: 0.264, documentedAssetBeta: 0.3103 },
  { name: "Japan Airlines", equityBeta5Y: 0.46, equityValue: 9165.46, totalDebt: 6933.18, marginalTaxRate: 0.2974, documentedAssetBeta: 0.3004 },
];

// SIA relever inputs (§6.4): D/E = 0.5174, tax = 0.17.
const SIA_TARGET = { debtToEquity: 0.5174, taxRate: 0.17 };

describe("hamada asset-beta from market values (tier 1)", () => {
  it("derives the asset beta from equity value and debt (PeerData shape)", () => {
    // Cathay Pacific: 0.38 / (1 + (9456.16/13002.44) * (1 - 0.165)).
    expect(assetBetaFromValue(0.38, 9456.16, 13002.44, 0.165)).toBeCloseTo(0.2364, 4);
  });

  it("is the D/E unlevering helper applied to totalDebt/equityValue", () => {
    // The value form must equal the lower-level D/E form on the same leverage.
    const dOverE = 9456.16 / 13002.44;
    expect(assetBetaFromValue(0.38, 9456.16, 13002.44, 0.165)).toBe(
      unleverBeta(0.38, dOverE, 0.165),
    );
  });

  it("rejects a non-positive equity value", () => {
    expect(() => assetBetaFromValue(0.38, 9456.16, 0, 0.165)).toThrow(RangeError);
  });

  it("still exposes the D/E form as a lower-level helper", () => {
    // hamadaBeta (D/E peers) is unchanged and independent of the value form.
    const result = hamadaBeta(
      [{ name: "peer", equityBeta: 1.0, debtToEquity: 0.5, taxRate: 0.2 }],
      { debtToEquity: 0.5174, taxRate: 0.17 },
    );
    expect(result.averageAssetBeta).toBeCloseTo(1.0 / (1 + 0.5 * 0.8), 10);
  });
});

describe("SIA beta build reproduces the reference anchors (tier 2, §6.4/§6.7)", () => {
  const result = hamadaBetaFromPeers(SIA_BETA_PEERS, SIA_TARGET);

  it("reproduces each peer's documented asset beta from its leverage", () => {
    for (const [i, peer] of SIA_BETA_PEERS.entries()) {
      const row = result.peers[i]!;
      expect(row.name).toBe(peer.name);
      expectWithinTolerance(row.assetBeta, peer.documentedAssetBeta, `${peer.name} asset beta`);
    }
  });

  it("averages only the non-excluded peers", () => {
    // Six of the seven peers contribute; Qantas is flagged excluded.
    expect(result.includedCount).toBe(6);
    expect(result.peers.find((p) => p.name === "Qantas")?.excluded).toBe(true);
  });

  it("averages the peer asset betas to 0.4805", () => {
    expectWithinTolerance(result.averageAssetBeta, 0.4805, "average asset beta");
  });

  it("relevers SIA's equity beta to 0.6868 at D/E 0.5174, tax 0.17", () => {
    expectWithinTolerance(result.releveredEquityBeta, 0.6868, "relevered equity beta");
  });

  it("moves the average when the outlier flag is toggled", () => {
    // Honouring `excluded` must actually change the average; a build that
    // ignored the flag would land on the all-seven average (~0.469).
    const withQantas = hamadaBetaFromPeers(
      SIA_BETA_PEERS.map((p) => ({ ...p, excluded: false })),
      SIA_TARGET,
    );
    expect(withQantas.includedCount).toBe(7);
    expect(withQantas.averageAssetBeta).not.toBeCloseTo(result.averageAssetBeta, 3);
  });

  it("throws if every peer is excluded", () => {
    expect(() =>
      hamadaBetaFromPeers(
        SIA_BETA_PEERS.map((p) => ({ ...p, excluded: true })),
        SIA_TARGET,
      ),
    ).toThrow(RangeError);
  });
});
