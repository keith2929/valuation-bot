// Adapter round-trip test (masterprompt2.md §6.8 "Adapter round-trip").
//
// This is the one test that wires the whole Bot 1 → Bot 2 seam together:
// hand-built SGX-shaped `ExtractionResult[]` for Singapore Airlines → the
// adapter's `toFinancialStatements` → the multi-year `FinancialStatements` of
// §6.1. It now lives inside the `adapter` package (previously it sat in
// `valuation-creator/core` and imported the adapter through a
// `../../../adapter/src/...` cross-package relative path); both the fixture and
// the reference `SIA_FINANCIALS` are local, so there is no cross-package import.
//
// The reports reproduce every field the adapter MAPS — the full income
// statement, the full balance sheet, and cash-flow D&A / capex / dividends —
// exactly equal to §6.1. The working-capital movements (`cashFlow.change*`) are
// DERIVED by the adapter from consecutive balance sheets (Part 3(d)), not
// transcribed, so they equal the balance-sheet deltas rather than §6.1's
// as-reported cash-flow lines; see the fixture header for the full rationale.

import { describe, expect, it } from "vitest";

import { toFinancialStatements } from "../src/toFinancialStatements";
import {
  SIA_FINANCIALS,
  siaExpectedStatements,
  siaExtractionReports,
} from "./fixtures/siaRoundTrip";

describe("adapter round trip (SIA fixture, §6.8)", () => {
  const { statements, warnings } = toFinancialStatements(siaExtractionReports);

  it("stitches four overlapping FY reports into FY2021–FY2025 in SGD", () => {
    expect(statements.fiscalYears).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(statements.currency).toBe("SGD");
  });

  it("reproduces the whole assembled FinancialStatements (§6.1, ΔNWC derived)", () => {
    expect(statements).toEqual(siaExpectedStatements);
  });

  it("reproduces §6.1 SIA_FINANCIALS exactly for every mapped field", () => {
    // Income statement and balance sheet are pure tag→field mappings, so they
    // must equal the §6.1 reference to the cent.
    expect(statements.incomeStatement).toEqual(SIA_FINANCIALS.incomeStatement);
    expect(statements.balanceSheet).toEqual(SIA_FINANCIALS.balanceSheet);
    // Cash-flow D&A, capex and dividends are mapped straight from tags too.
    expect(statements.cashFlow.dandA).toEqual(SIA_FINANCIALS.cashFlow.dandA);
    expect(statements.cashFlow.capex).toEqual(SIA_FINANCIALS.cashFlow.capex);
    expect(statements.cashFlow.commonDividendsPaid).toEqual(
      SIA_FINANCIALS.cashFlow.commonDividendsPaid,
    );
  });

  it("raises no warnings — every field is tagged in every year and the sheet ties out", () => {
    expect(warnings).toEqual([]);
  });

  it("derives working-capital movements as year-over-year balance-sheet deltas", () => {
    // FY2021 has no prior period, so every opening delta is 0 — this is exactly
    // why the derived series cannot equal §6.1's as-reported cash-flow movements
    // (which carry nonzero FY2021 values). FY2022 receivables delta = 1750.8 −
    // 1035.9; FY2025 = 1593.6 − 1865.9.
    expect(statements.cashFlow.changeReceivables[0]).toBe(0);
    expect(statements.cashFlow.changeReceivables[1]).toBeCloseTo(714.9, 6);
    expect(statements.cashFlow.changeReceivables[4]).toBeCloseTo(-272.3, 6);
    expect(statements.cashFlow.changeInventory[0]).toBe(0);
    expect(statements.cashFlow.changeUnearnedRev[0]).toBe(0);
  });

  it("is insensitive to the order the reports are fed in", () => {
    const reversed = toFinancialStatements([...siaExtractionReports].reverse());
    expect(reversed.statements).toEqual(siaExpectedStatements);
    expect(reversed.warnings).toEqual(warnings);
  });

  it("derives a five-year timeline from a single report's comparative column", () => {
    const fy2025Report = siaExtractionReports[siaExtractionReports.length - 1]!;
    const { statements: single } = toFinancialStatements([fy2025Report]);

    expect(single.fiscalYears).toEqual(["2024", "2025"]);
    expect(single.balanceSheet.receivables).toEqual([1865.9, 1593.6]);
    expect(single.cashFlow.changeReceivables[0]).toBe(0);
    expect(single.cashFlow.changeReceivables[1]).toBeCloseTo(-272.3, 6);
  });
});

describe("adapter overlap cross-check (§6.8)", () => {
  // Restate the FY2024 report's comparative revenue (FY2023) so the two reports
  // that both observe FY2023 disagree: the FY2023 report's current column says
  // 17774.8, the FY2024 report's comparative column now says 17700. The adapter
  // must flag the mismatch and keep the audited figure.
  const base = siaExtractionReports[2]!; // FY2024 report (current FY2024, comp FY2023)
  const restated = structuredClone(base);
  const revLine = restated.statements.income_statement.find((l) => l.tag === "revenue")!;
  revLine.value_comparative = 17700; // was 17774.8

  const { statements, warnings } = toFinancialStatements([
    siaExtractionReports[1]!, // FY2023 report: current FY2023 = 17774.8
    restated,
  ]);

  it("pushes an overlap-mismatch warning naming the field and preferring audited", () => {
    const mismatch = warnings.find(
      (w) => w.includes("Overlap mismatch") && w.includes("revenue"),
    );
    expect(mismatch).toBeDefined();
    expect(mismatch).toContain("17774.8");
    expect(mismatch).toContain("17700");
  });

  it("keeps one value per year (the audited earlier-current figure)", () => {
    const idx2023 = statements.fiscalYears.indexOf("2023");
    // Both columns are audited; the deterministic tie-break keeps the FY2023
    // report's current column (17774.8) over the FY2024 comparative (17700).
    expect(statements.incomeStatement.revenue[idx2023]).toBe(17774.8);
  });
});
