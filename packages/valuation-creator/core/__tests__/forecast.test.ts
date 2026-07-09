// Tier-2 integration test for the composed forecast (src/forecast.ts:
// buildForecast). Replaces the old (deleted, WP task-7) forecast.test.ts,
// which tested the prior percent-of-revenue/ebitdaMargin-driven model that
// buildForecast no longer implements.
//
// This test feeds `SIA_FINANCIALS` (the historical FinancialStatements
// fixture, fixtures/siaAssumptions.ts) and `siaForecastAssumptions` (the
// forecast-only assumptions fixture, fixtures/siaForecastAssumptions.ts —
// "SIA_ASSUMPTIONS" in the task framing) into `buildForecast` under the Base
// scenario and asserts the composed result reproduces every per-line driver
// and intermediate schedule already pinned as golden by the sibling
// per-schedule fixtures (siaIncomeStatement.ts, siaPpeSchedule.ts,
// siaWorkingCapital.ts, siaNetIncome.ts, siaForecastAssumptions.ts) — i.e.
// "SIA_FORECAST_DRIVERS" in the task framing is these fixtures' arrays
// composed together, not a new/separately-invented fixture, per the repo's
// standing rule against reverse-calibrating goldens.
//
// Day-count convention: every days-outstanding driver
// (receivablesDays/inventoryDaysOfCogs/prepaidDaysOfCogs/
// accountsPayableDaysOfCogs/accruedDaysOfCogs) is computed on a 365-day
// year (`daysOutstanding` in src/forecast.ts: `line / base * 365`), as a
// trailing 3-fiscal-year average over FY2023–FY2025
// (`SIA_FINANCIALS.fiscalYears` = ["2021","2022","2023","2024","2025"], so
// the 3-year window is the last 3 entries) via `deriveOperatingAssumptions`,
// then held flat across all 5 forecast years (FY2026–FY2030). The same
// 365-day/FY23-25-average/held-flat convention applies to the
// percent-of-revenue and percent-of-COGS drivers derived alongside it
// (cogsPctRevenue uses a 4-year window; sgaPctRevenue/unearnedRevenuePctRevenue/
// otherCurrentLiabilitiesPctOfTotalCurrentLiabilities use the same 3-year
// window; otherOpExPctRevenue is the single most recent fiscal year — see
// `OperatingAssumptions` in src/forecast.ts for the exact window per line).

import { describe, expect, it } from "vitest";

import { buildForecast } from "../src/forecast";
import { SIA_FINANCIALS } from "./fixtures/siaAssumptions";
import { siaForecastAssumptions, siaForecastExpectedFreeCashFlows } from "./fixtures/siaForecastAssumptions";
import { siaIncomeStatementExpectedSchedules, SIA_BASE_REVENUE } from "./fixtures/siaIncomeStatement";
import { siaNetIncomeExpectedSchedules } from "./fixtures/siaNetIncome";
import { siaPpeExpectedSchedules } from "./fixtures/siaPpeSchedule";
import { siaWorkingCapitalExpectedSchedules } from "./fixtures/siaWorkingCapital";

/** ±0.01 S$ millions, per the task spec. */
const TOLERANCE_DIGITS = 2;

describe("buildForecast integration (tier 2, SIA fixtures, Base scenario)", () => {
  const result = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "base");

  it("reproduces the FCFF driver schedule's revenue/ebit/ebitda/dandA/capex/changeNWC/netIncome/fcff to within ±0.01", () => {
    result.drivers.years.forEach((year, i) => {
      expect(year.revenue).toBeCloseTo(siaIncomeStatementExpectedSchedules.revenue[i]!, TOLERANCE_DIGITS);
      expect(year.ebit).toBeCloseTo(siaIncomeStatementExpectedSchedules.ebit[i]!, TOLERANCE_DIGITS);
      expect(year.ebitda).toBeCloseTo(siaIncomeStatementExpectedSchedules.ebitda[i]!, TOLERANCE_DIGITS);
      expect(year.dandA).toBeCloseTo(siaPpeExpectedSchedules.depreciationAndAmortisation[i]!, TOLERANCE_DIGITS);
      // ForecastDriverYear.capex is a NEGATIVE cash outflow; the source
      // schedule's capitalExpenditure input is a positive spend.
      expect(year.capex).toBeCloseTo(-siaForecastAssumptions.years[i]!.capitalExpenditure, TOLERANCE_DIGITS);
      expect(year.changeNWC).toBeCloseTo(
        siaWorkingCapitalExpectedSchedules.changeInNetWorkingCapital[i]!,
        TOLERANCE_DIGITS,
      );
      expect(year.netIncome).toBeCloseTo(siaNetIncomeExpectedSchedules.netIncome[i]!, TOLERANCE_DIGITS);
      expect(year.fcff).toBeCloseTo(siaForecastExpectedFreeCashFlows[i]!, TOLERANCE_DIGITS);
    });
  });

  it("reproduces the working-capital schedule's per-year NWC level to within ±0.01", () => {
    result.workingCapital.years.forEach((year, i) => {
      expect(year.netWorkingCapital).toBeCloseTo(
        siaWorkingCapitalExpectedSchedules.netWorkingCapital[i]!,
        TOLERANCE_DIGITS,
      );
    });
    // Spot-check the full range as given in the task spec.
    expect(result.workingCapital.years[0]!.netWorkingCapital).toBeCloseTo(-9235.0208891391921, TOLERANCE_DIGITS);
    expect(result.workingCapital.years[4]!.netWorkingCapital).toBeCloseTo(-10178.057902319057, TOLERANCE_DIGITS);
  });

  it("reproduces the net-income schedule's ending-cash, interest-expense and interest-income arrays to within ±0.01", () => {
    result.netIncome.years.forEach((year, i) => {
      expect(year.endingCash).toBeCloseTo(siaNetIncomeExpectedSchedules.endingCash[i]!, TOLERANCE_DIGITS);
      expect(year.interestExpense).toBeCloseTo(siaNetIncomeExpectedSchedules.interestExpense[i]!, TOLERANCE_DIGITS);
      expect(year.interestIncome).toBeCloseTo(siaNetIncomeExpectedSchedules.interestIncome[i]!, TOLERANCE_DIGITS);
    });
    // Spot-check the full range as given in the task spec.
    expect(result.netIncome.years[0]!.endingCash).toBeCloseTo(8405.1389537723535, TOLERANCE_DIGITS);
    expect(result.netIncome.years[4]!.endingCash).toBeCloseTo(7500.6219792234315, TOLERANCE_DIGITS);
  });

  it("reproduces the balance-sheet/cash-flow block's ending cash consistently with the net-income schedule", () => {
    result.balanceSheetCashFlow.years.forEach((year, i) => {
      expect(year.endingCash).toBeCloseTo(siaNetIncomeExpectedSchedules.endingCash[i]!, TOLERANCE_DIGITS);
      expect(year.cash).toBeCloseTo(siaNetIncomeExpectedSchedules.endingCash[i]!, TOLERANCE_DIGITS);
    });
  });

  it("balances (totalAssets == totalLiabilities + totalEquity) for every one of the 5 forecast years", () => {
    expect(result.balanceSheetCashFlow.years).toHaveLength(5);
    for (const year of result.balanceSheetCashFlow.years) {
      expect(year.totalAssets).toBeCloseTo(year.totalLiabilities + year.totalEquity, 6);
    }
  });

  it("shifts FY26 (forecast year 1) revenue growth by ±0.01 for Bear/Bull vs. Base", () => {
    const bear = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "bear");
    const bull = buildForecast(SIA_FINANCIALS, siaForecastAssumptions, "bull");

    const bearFy26Growth = bear.drivers.years[0]!.revenue / SIA_BASE_REVENUE - 1;
    const bullFy26Growth = bull.drivers.years[0]!.revenue / SIA_BASE_REVENUE - 1;

    expect(bearFy26Growth).toBeCloseTo(0.012931184556648665, 9);
    expect(bullFy26Growth).toBeCloseTo(0.032931184556648667, 9);

    // Base itself must sit exactly between (the DEFAULT_SCENARIO_OFFSETS
    // revenue-growth offset is symmetric, ±0.01).
    const baseFy26Growth = result.drivers.years[0]!.revenue / SIA_BASE_REVENUE - 1;
    expect(baseFy26Growth).toBeCloseTo(0.022931184556648665, 9);
    expect(bearFy26Growth).toBeCloseTo(baseFy26Growth - 0.01, 9);
    expect(bullFy26Growth).toBeCloseTo(baseFy26Growth + 0.01, 9);
  });
});
