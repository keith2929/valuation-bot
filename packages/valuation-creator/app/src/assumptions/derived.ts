import type { ForecastAssumptions } from "@valuation-bot/valuation-creator";

/**
 * Scenario-resolution helpers mirroring `@valuation-bot/valuation-creator-core`
 * forecast.ts's `chooseScenario`/`DEFAULT_SCENARIO_OFFSETS` semantics exactly
 * (revenue growth/SG%/other-opex offset symmetrically; COGS asymmetrically),
 * so the Assumptions panel's displayed "effective" figures always match what
 * `buildIncomeStatementForecast` would compute for the same scenario.
 */
function chooseScenario(scenario: ForecastAssumptions["scenario"], bear: number, base: number, bull: number): number {
  switch (scenario) {
    case "Bear":
      return bear;
    case "Base":
      return base;
    case "Bull":
      return bull;
  }
}

/** Per-year effective revenue growth (FY26..FY30) for the active scenario. */
export function effectiveRevenueGrowth(a: ForecastAssumptions): number[] {
  const offset = a.scenarioOffsets.revenueGrowth;
  return a.baseRevenueGrowth.map((base) => chooseScenario(a.scenario, base - offset, base, base + offset));
}

/** Per-year effective COGS % of revenue (FY26..FY30) for the active scenario. */
export function effectiveCogsPctRevenue(a: ForecastAssumptions): number[] {
  const { bear, bull } = a.scenarioOffsets.cogs;
  return a.cogsPctRevBaseOverrides.map((override, i) => {
    const base = override ?? a.cogsPctRev.base[i] ?? 0;
    return chooseScenario(a.scenario, base + bear, base, base + bull);
  });
}

/** Effective SG&A % of revenue (held flat across years) for the active scenario. */
export function effectiveSgaPctRevenue(a: ForecastAssumptions): number {
  const { base } = a.sgaPctRev;
  const offset = a.scenarioOffsets.sga;
  return chooseScenario(a.scenario, base - offset, base, base + offset);
}

/** Effective other-opex % of revenue (held flat across years) for the active scenario. */
export function effectiveOtherOpExPctRevenue(a: ForecastAssumptions): number {
  const { base } = a.otherOpExPctRev;
  const offset = a.scenarioOffsets.otherOpEx;
  return chooseScenario(a.scenario, base - offset, base, base + offset);
}
