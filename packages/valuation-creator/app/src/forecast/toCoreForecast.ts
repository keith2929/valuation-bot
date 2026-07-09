import type { ForecastAssumptions as AppForecastAssumptions } from "@valuation-bot/valuation-creator";
import type {
  ForecastAssumptions as CoreForecastAssumptions,
  Scenario as CoreScenario,
} from "@valuation-bot/valuation-creator-core";

/** Maps the Assumptions panel's "Bear"/"Base"/"Bull" to core's `Scenario` union. */
export function toCoreScenario(scenario: AppForecastAssumptions["scenario"]): CoreScenario {
  switch (scenario) {
    case "Bear":
      return "bear";
    case "Base":
      return "base";
    case "Bull":
      return "bull";
  }
}

/**
 * Adapts the Assumptions panel's editable `ForecastAssumptions` shape (which
 * carries every model input the panel exposes, including WACC/DDM inputs
 * `buildForecast` doesn't consume) into core's narrower
 * `ForecastAssumptions` (revenue growth / COGS% / capex per year, tax rate,
 * and scenario offsets). SG&A%/other-opex% base rates are NOT passed through
 * here: `buildForecast` derives those from the historical trailing average
 * via `deriveOperatingAssumptions`, not from the panel's editable base rate —
 * the panel's SG&A/other-opex "effective" figures only affect `buildForecast`
 * through the scenario offsets that flow through below.
 */
export function toCoreForecastAssumptions(assumptions: AppForecastAssumptions): CoreForecastAssumptions {
  // Core's `DEFAULT_SCENARIO_OFFSETS` is declared `as const`, so
  // `Partial<typeof DEFAULT_SCENARIO_OFFSETS>` narrows each field to its
  // default literal type -- cast, since these are genuinely user-editable
  // numbers, not the fixed defaults.
  const offsets = {
    revenueGrowth: assumptions.scenarioOffsets.revenueGrowth,
    cogsPctRevenueBear: assumptions.scenarioOffsets.cogs.bear,
    cogsPctRevenueBull: assumptions.scenarioOffsets.cogs.bull,
    sgaPctRevenue: assumptions.scenarioOffsets.sga,
    otherOpExPctRevenue: assumptions.scenarioOffsets.otherOpEx,
  } as NonNullable<CoreForecastAssumptions["offsets"]>;

  return {
    taxRate: assumptions.taxRate,
    offsets,
    years: assumptions.baseRevenueGrowth.map((revenueGrowthBase, i) => ({
      revenueGrowthBase,
      cogsPctRevenueBase: assumptions.cogsPctRevBaseOverrides[i] ?? assumptions.cogsPctRev.base[i] ?? 0,
      capitalExpenditure: Math.abs(assumptions.capex[i] ?? 0),
    })),
  };
}
