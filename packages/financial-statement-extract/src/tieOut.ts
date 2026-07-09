import type { ExtractionResult, ExtractionLine } from "@valuation-bot/contract";

export interface TieOutViolation {
  rule: string;
  period: "current" | "comparative";
  description: string;
  lhs_value: number;
  rhs_value: number;
  difference: number;
}

// Allow 1 unit of absolute difference to absorb floating-point imprecision.
// Statements with deliberate rounding differences (common in FX-translated reports)
// will still appear as violations — that is intentional.
const TOLERANCE = 1;

function findByTag(lines: ExtractionLine[], tag: string): ExtractionLine | undefined {
  return lines.find((l) => l.tag === tag);
}

function pick(
  line: ExtractionLine | undefined,
  period: "current" | "comparative",
): number | null {
  if (!line) return null;
  return period === "current" ? line.value : line.value_comparative;
}

function checkEquals(
  violations: TieOutViolation[],
  rule: string,
  period: "current" | "comparative",
  lhsTag: string,
  lhsValue: number | null,
  rhsTags: string[],
  rhsValues: (number | null)[],
): void {
  if (lhsValue === null || rhsValues.some((v) => v === null)) return;
  const rhs = (rhsValues as number[]).reduce((sum, v) => sum + v, 0);
  const diff = lhsValue - rhs;
  if (Math.abs(diff) > TOLERANCE) {
    violations.push({
      rule,
      period,
      description:
        `${lhsTag} (${lhsValue}) != ${rhsTags.join(" + ")} (${(rhsValues as number[]).join(" + ")} = ${rhs})`,
      lhs_value: lhsValue,
      rhs_value: rhs,
      difference: diff,
    });
  }
}

export function tieOut(result: ExtractionResult): TieOutViolation[] {
  const violations: TieOutViolation[] = [];
  const bs = result.statements.balance_sheet;
  const is_ = result.statements.income_statement;
  const cf = result.statements.cash_flow;

  for (const period of ["current", "comparative"] as const) {
    // ── Balance Sheet ────────────────────────────────────────────────────────

    const totalAssets = pick(findByTag(bs, "total_assets"), period);
    const totalCurrentAssets = pick(findByTag(bs, "total_current_assets"), period);
    const totalNonCurrentAssets = pick(findByTag(bs, "total_non_current_assets"), period);
    const totalLiabilities = pick(findByTag(bs, "total_liabilities"), period);
    const totalCurrentLiabilities = pick(findByTag(bs, "total_current_liabilities"), period);
    const totalNonCurrentLiabilities = pick(findByTag(bs, "total_non_current_liabilities"), period);
    const totalEquity = pick(findByTag(bs, "total_equity"), period);

    // total_assets = total_current_assets + total_non_current_assets
    checkEquals(
      violations,
      "total_assets_breakdown",
      period,
      "total_assets",
      totalAssets,
      ["total_current_assets", "total_non_current_assets"],
      [totalCurrentAssets, totalNonCurrentAssets],
    );

    // total_liabilities = total_current_liabilities + total_non_current_liabilities
    checkEquals(
      violations,
      "total_liabilities_breakdown",
      period,
      "total_liabilities",
      totalLiabilities,
      ["total_current_liabilities", "total_non_current_liabilities"],
      [totalCurrentLiabilities, totalNonCurrentLiabilities],
    );

    // Fundamental balance sheet equation: assets = liabilities + equity
    checkEquals(
      violations,
      "balance_sheet_equation",
      period,
      "total_assets",
      totalAssets,
      ["total_liabilities", "total_equity"],
      [totalLiabilities, totalEquity],
    );

    // ── Income Statement ──────────────────────────────────────────────────────

    const revenue = pick(findByTag(is_, "revenue"), period);
    const costOfSales = pick(findByTag(is_, "cost_of_sales"), period);
    const grossProfit = pick(findByTag(is_, "gross_profit"), period);
    const netProfit = pick(findByTag(is_, "net_profit"), period);
    const profitOwners = pick(findByTag(is_, "profit_attributable_to_owners"), period);
    const profitNCI = pick(findByTag(is_, "profit_attributable_to_nci"), period);

    // gross_profit = revenue + cost_of_sales
    // cost_of_sales is negative when the statement uses parentheses for expenses;
    // if it is positive (common when not parenthesised), this check will surface
    // the discrepancy for manual review.
    checkEquals(
      violations,
      "gross_profit_check",
      period,
      "gross_profit",
      grossProfit,
      ["revenue", "cost_of_sales"],
      [revenue, costOfSales],
    );

    // net_profit = profit_attributable_to_owners + profit_attributable_to_nci
    checkEquals(
      violations,
      "net_profit_attribution_check",
      period,
      "net_profit",
      netProfit,
      ["profit_attributable_to_owners", "profit_attributable_to_nci"],
      [profitOwners, profitNCI],
    );

    // ── Cash Flow ─────────────────────────────────────────────────────────────

    const opCF = pick(findByTag(cf, "net_cash_from_operating"), period);
    const invCF = pick(findByTag(cf, "net_cash_from_investing"), period);
    const finCF = pick(findByTag(cf, "net_cash_from_financing"), period);
    const netChangeCash = pick(findByTag(cf, "net_change_in_cash"), period);
    const cashBegin = pick(findByTag(cf, "cash_beginning_of_period"), period);
    const cashEnd = pick(findByTag(cf, "cash_end_of_period"), period);
    const fxEffect = pick(findByTag(cf, "effect_of_fx"), period);

    // net_change_in_cash = operating + investing + financing
    checkEquals(
      violations,
      "net_change_in_cash_check",
      period,
      "net_change_in_cash",
      netChangeCash,
      ["net_cash_from_operating", "net_cash_from_investing", "net_cash_from_financing"],
      [opCF, invCF, finCF],
    );

    // cash_end = cash_beginning + net_change [+ effect_of_fx if present]
    if (fxEffect !== null) {
      checkEquals(
        violations,
        "cash_movement_check",
        period,
        "cash_end_of_period",
        cashEnd,
        ["cash_beginning_of_period", "net_change_in_cash", "effect_of_fx"],
        [cashBegin, netChangeCash, fxEffect],
      );
    } else {
      checkEquals(
        violations,
        "cash_movement_check",
        period,
        "cash_end_of_period",
        cashEnd,
        ["cash_beginning_of_period", "net_change_in_cash"],
        [cashBegin, netChangeCash],
      );
    }
  }

  return violations;
}
