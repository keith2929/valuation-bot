// Trading comps test (src/comps.ts) — masterprompt §6.5.
//
// Test tiers in this package:
// - Tier 1: pure-function unit tests of quartileExc/computeStatistics/
//   peerMultiples.
// - Tier 2 (second block): the full comps build against the SIA comps-peer
//   fixture (§6.5), reproducing the source Excel "Comps" sheet's Average /
//   Minimum / 25th percentile / Median / 75th percentile / Maximum rows to
//   within 1e-9 absolute tolerance.

import { describe, expect, it } from "vitest";

import {
  applyCompsToTarget,
  buildComps,
  computeStatistics,
  getDefaultDcfExitMultiple,
  peerMultiples,
  quartileExc,
} from "../src/comps";
import { SIA_COMPS_EXPECTED, SIA_COMPS_PEERS } from "./fixtures/siaComps";
import { SIA_COMPS_TARGET } from "./fixtures/siaCompsTarget";

const TOLERANCE = 1e-9;

function expectClose(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThan(
    TOLERANCE,
  );
}

function expectStatistics(
  actual: ReturnType<typeof computeStatistics>,
  expected: (typeof SIA_COMPS_EXPECTED)["peLtm"],
  label: string,
): void {
  expectClose(actual.average, expected.average, `${label} average`);
  expectClose(actual.minimum, expected.minimum, `${label} minimum`);
  expectClose(actual.p25, expected.p25, `${label} p25`);
  expectClose(actual.median, expected.median, `${label} median`);
  expectClose(actual.p75, expected.p75, `${label} p75`);
  expectClose(actual.maximum, expected.maximum, `${label} maximum`);
}

describe("quartileExc (tier 1)", () => {
  it("uses QUARTILE.EXC's (n+1)*p position with linear interpolation", () => {
    const sorted = [1, 2, 3, 4];
    // h = (4+1)*0.25 = 1.25 -> between sorted[0]=1 and sorted[1]=2.
    expect(quartileExc(sorted, 0.25)).toBeCloseTo(1.25, 10);
    // h = (4+1)*0.75 = 3.75 -> between sorted[2]=3 and sorted[3]=4.
    expect(quartileExc(sorted, 0.75)).toBeCloseTo(3.75, 10);
  });

  it("differs from the inclusive QUARTILE.INC/PERCENTILE method", () => {
    // QUARTILE.INC(1..4, 1) = 1.75 (position 1 + 0.75*(n-1)*p); EXC gives 1.25.
    const sorted = [1, 2, 3, 4];
    expect(quartileExc(sorted, 0.25)).not.toBeCloseTo(1.75, 5);
  });

  it("throws when the requested position falls outside [1, n]", () => {
    // n=2: h = (2+1)*0.25 = 0.75, below the valid [1, n] range.
    expect(() => quartileExc([1, 2], 0.25)).toThrow(RangeError);
  });
});

describe("computeStatistics (tier 1)", () => {
  it("computes average/min/quartiles/median/max over an even-length set", () => {
    const stats = computeStatistics([4, 1, 3, 2]);
    expect(stats.average).toBe(2.5);
    expect(stats.minimum).toBe(1);
    expect(stats.maximum).toBe(4);
    expect(stats.median).toBe(2.5);
    expect(stats.p25).toBeCloseTo(quartileExc([1, 2, 3, 4], 0.25), 12);
    expect(stats.p75).toBeCloseTo(quartileExc([1, 2, 3, 4], 0.75), 12);
  });

  it("computes the median as the middle value over an odd-length set", () => {
    expect(computeStatistics([5, 1, 3]).median).toBe(3);
  });

  it("throws on an empty input", () => {
    expect(() => computeStatistics([])).toThrow(RangeError);
  });
});

describe("peerMultiples (tier 1)", () => {
  it("derives market cap, EV, and LTM multiples from a single PeerData", () => {
    const peer = SIA_COMPS_PEERS[0]!; // Cathay Pacific
    const result = peerMultiples(peer);
    expect(result.priceSGD).toBe(peer.currentPrice);
    expect(result.marketCap).toBe(peer.currentPrice * peer.sharesOutstanding);
    const expectedEv =
      result.marketCap +
      (-peer.cashAndSTInvestments + peer.totalDebt + peer.preferredEquity + peer.minorityInterest) *
        peer.fxToTargetCurrency;
    expect(result.ev).toBe(expectedEv);
    expect(result.peLtm).toBe(result.marketCap / peer.earnings);
    expect(result.pbLtm).toBe(result.marketCap / peer.bookValue);
    expect(result.evEbitdaLtm).toBe(result.ev / peer.ebitda);
  });

  it("takes NTM P/E and NTM EV/EBITDA directly from the peer, not derived", () => {
    const peer = SIA_COMPS_PEERS[0]!;
    const result = peerMultiples(peer);
    expect(result.peNtm).toBe(peer.ntmPE);
    expect(result.evEbitdaNtm).toBe(peer.ntmEvEbitda);
  });
});

describe("SIA comps build reproduces the source sheet (tier 2, §6.5)", () => {
  const result = buildComps(SIA_COMPS_PEERS);

  it("builds one row per peer, in order", () => {
    expect(result.peers.map((p) => p.name)).toEqual(SIA_COMPS_PEERS.map((p) => p.name));
  });

  it("reproduces LTM EV/EBITDA statistics", () => {
    expectStatistics(result.evEbitdaLtm, SIA_COMPS_EXPECTED.evEbitdaLtm, "LTM EV/EBITDA");
  });

  it("reproduces LTM P/E statistics", () => {
    expectStatistics(result.peLtm, SIA_COMPS_EXPECTED.peLtm, "LTM P/E");
  });

  it("reproduces LTM P/B statistics", () => {
    expectStatistics(result.pbLtm, SIA_COMPS_EXPECTED.pbLtm, "LTM P/B");
  });

  it("reproduces NTM P/E statistics", () => {
    expectStatistics(result.peNtm, SIA_COMPS_EXPECTED.peNtm, "NTM P/E");
  });

  it("reproduces NTM EV/EBITDA statistics", () => {
    expectStatistics(result.evEbitdaNtm, SIA_COMPS_EXPECTED.evEbitdaNtm, "NTM EV/EBITDA");
  });

  it("throws on an empty peer set", () => {
    expect(() => buildComps([])).toThrow(RangeError);
  });
});

describe("applyCompsToTarget (tier 2, §6.5)", () => {
  const result = buildComps(SIA_COMPS_PEERS);
  const implied = applyCompsToTarget(result, SIA_COMPS_TARGET);

  it("implies LTM EV/EBITDA prices from EV = mult * ltmEbitda, equity = EV - ltmDebt + ltmCash", () => {
    expectClose(implied.evEbitdaLtm.minimum.impliedPrice, 3.7088894852777581, "EV/EBITDA LTM min price");
    expectClose(implied.evEbitdaLtm.median.impliedPrice, 5.8119840942840115, "EV/EBITDA LTM median price");
    expectClose(implied.evEbitdaLtm.maximum.impliedPrice, 8.124353104715091, "EV/EBITDA LTM max price");
  });

  it("reports LTM EV/EBITDA min upside = price / currentPrice - 1", () => {
    expectClose(implied.evEbitdaLtm.minimum.upside, -0.42852242137476765, "EV/EBITDA LTM min upside");
  });

  it("implies LTM P/B prices from equity = mult * ltmBookValueOfEquity", () => {
    expectClose(implied.pbLtm.minimum.impliedPrice, 3.7511729198939783, "P/B LTM min price");
    expectClose(implied.pbLtm.maximum.impliedPrice, 6.7154011474410771, "P/B LTM max price");
  });

  it("implies LTM P/E prices from equity = mult * ltmEarnings", () => {
    expectClose(implied.peLtm.minimum.impliedPrice, 6.614793976362443, "P/E LTM min price");
    expectClose(implied.peLtm.median.impliedPrice, 7.5094382805271378, "P/E LTM median price");
    expectClose(implied.peLtm.maximum.impliedPrice, 11.264183397101952, "P/E LTM max price");
  });

  it("implies NTM EV/EBITDA prices from EV = mult * ntmEbitda, equity = EV - ntmDebt + ntmCash", () => {
    expectClose(implied.evEbitdaNtm.minimum.impliedPrice, 3.9316748383574804, "EV/EBITDA NTM min price");
    expectClose(implied.evEbitdaNtm.maximum.impliedPrice, 8.9846777961471993, "EV/EBITDA NTM max price");
  });

  it("implies NTM P/E prices from equity = mult * ntmEarnings", () => {
    expectClose(implied.peNtm.minimum.impliedPrice, 4.3333727772211184, "P/E NTM min price");
    expectClose(implied.peNtm.maximum.impliedPrice, 6.2649807733419047, "P/E NTM max price");
  });

  it("carries the summary multiple itself through unchanged", () => {
    expect(implied.evEbitdaLtm.median.multiple).toBe(result.evEbitdaLtm.median);
  });
});

describe("getDefaultDcfExitMultiple (tier 2, §6.5)", () => {
  it("returns the peer set's median LTM EV/EBITDA as the DCF exit multiple", () => {
    const result = buildComps(SIA_COMPS_PEERS);
    expectClose(
      getDefaultDcfExitMultiple(result),
      4.7453976643893281,
      "default DCF exit multiple",
    );
  });
});
