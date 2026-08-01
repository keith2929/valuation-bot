/**
 * Mapping from Polygon's standardized XBRL statement fields (as returned
 * under `financials.income_statement` / `.balance_sheet` /
 * `.cash_flow_statement` in the `vX/reference/financials` response) to the
 * canonical line-item tags.
 *
 * Tags reuse the exact vocabulary `@valuation-bot/edgar-adapter` and
 * `@valuation-bot/fmp-adapter` use for the same concepts (e.g. "netIncome",
 * "totalAssets") so the orchestrator can merge/compare same-tag fields
 * across tiers/sources. Unlike FMP, Polygon's standardized model does not
 * expose every line item every other vendor does (notably: no
 * depreciation/amortization, capex, dividends, or buyback figures in cash
 * flow, and a thinner balance-sheet breakdown) - concepts with no Polygon
 * field are simply omitted here, which surfaces as a `missingTags` /
 * `MISSING_CONCEPT` note rather than a fabricated value.
 *
 * This module is pure data - no I/O - so it can be inspected and
 * unit-tested on its own.
 */
import type { CanonicalFinancials } from "@valuation-bot/canonical";

/** One canonical line item and the single Polygon standardized field name that supplies it. */
export interface ConceptDef {
  /** Canonical, cross-market/cross-source tag, e.g. "revenue", "netIncome". */
  tag: string;
  /** Human-readable label for the line item. */
  label: string;
  /** Field name within the matching `financials.<category>` object of a Polygon result row. */
  field: string;
}

/** The `financials.<category>` key Polygon nests each canonical statement's fields under. */
export const STATEMENT_CATEGORY: Record<keyof CanonicalFinancials, "income_statement" | "balance_sheet" | "cash_flow_statement"> = {
  incomeStatement: "income_statement",
  balanceSheet: "balance_sheet",
  cashFlow: "cash_flow_statement",
};

/** Polygon standardized field name -> canonical tag/label for all three core statements. */
export const CONCEPT_MAP: Record<keyof CanonicalFinancials, ConceptDef[]> = {
  incomeStatement: [
    { tag: "revenue", label: "Revenue", field: "revenues" },
    { tag: "costOfRevenue", label: "Cost of revenue", field: "cost_of_revenue" },
    { tag: "grossProfit", label: "Gross profit", field: "gross_profit" },
    { tag: "researchAndDevelopment", label: "Research and development expense", field: "research_and_development" },
    {
      tag: "sellingGeneralAndAdministrative",
      label: "Selling, general and administrative expense",
      field: "selling_general_and_administrative_expenses",
    },
    { tag: "operatingExpenses", label: "Operating expenses", field: "operating_expenses" },
    { tag: "operatingIncome", label: "Operating income", field: "operating_income_loss" },
    { tag: "interestExpense", label: "Interest expense", field: "interest_expense_operating" },
    { tag: "incomeBeforeTax", label: "Income before income taxes", field: "income_loss_from_continuing_operations_before_tax" },
    { tag: "incomeTaxExpense", label: "Income tax expense (benefit)", field: "income_tax_expense_benefit" },
    { tag: "netIncome", label: "Net income", field: "net_income_loss" },
    { tag: "epsBasic", label: "Earnings per share, basic", field: "basic_earnings_per_share" },
    { tag: "epsDiluted", label: "Earnings per share, diluted", field: "diluted_earnings_per_share" },
    { tag: "weightedAverageSharesBasic", label: "Weighted-average shares outstanding, basic", field: "basic_average_shares" },
    { tag: "weightedAverageSharesDiluted", label: "Weighted-average shares outstanding, diluted", field: "diluted_average_shares" },
  ],
  balanceSheet: [
    { tag: "cashAndCashEquivalents", label: "Cash and cash equivalents", field: "cash" },
    { tag: "inventory", label: "Inventory, net", field: "inventory" },
    { tag: "totalCurrentAssets", label: "Total current assets", field: "current_assets" },
    { tag: "propertyPlantAndEquipmentNet", label: "Property, plant and equipment, net", field: "fixed_assets" },
    { tag: "totalAssets", label: "Total assets", field: "assets" },
    { tag: "accountsPayable", label: "Accounts payable", field: "accounts_payable" },
    { tag: "totalCurrentLiabilities", label: "Total current liabilities", field: "current_liabilities" },
    { tag: "longTermDebt", label: "Long-term debt, noncurrent", field: "long_term_debt" },
    { tag: "totalLiabilities", label: "Total liabilities", field: "liabilities" },
    { tag: "totalEquity", label: "Total stockholders' equity", field: "equity_attributable_to_parent" },
  ],
  cashFlow: [
    { tag: "netCashFromOperating", label: "Net cash provided by (used in) operating activities", field: "net_cash_flow_from_operating_activities" },
    { tag: "netCashFromInvesting", label: "Net cash provided by (used in) investing activities", field: "net_cash_flow_from_investing_activities" },
    { tag: "netCashFromFinancing", label: "Net cash provided by (used in) financing activities", field: "net_cash_flow_from_financing_activities" },
  ],
};
