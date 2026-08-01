/**
 * Mapping from Yahoo Finance's `quoteSummary` statement-history field names to
 * the canonical line-item tags for the three core statements. Yahoo's
 * unofficial endpoint exposes a much shallower, pre-normalized field set than
 * a primary filing or a licensed vendor - one field per concept, no
 * candidate list to search - so, like `@valuation-bot/fmp-adapter`, each
 * canonical tag here has exactly one source field.
 *
 * Tags reuse the exact vocabulary `@valuation-bot/edgar-adapter` and
 * `@valuation-bot/fmp-adapter` use for the same concepts (e.g. "netIncome",
 * "totalAssets") so the orchestrator can merge/compare same-tag fields across
 * tiers/sources. Concepts Yahoo's free endpoint does not reliably expose
 * (e.g. per-share/EPS figures, which live in a different, unrequested module)
 * are simply omitted here rather than mapped to a field that's usually
 * absent - `buildStatement`'s `missingTags` mechanism already reports gaps.
 *
 * This module is pure data - no I/O - so it can be inspected and unit-tested
 * on its own.
 */
import type { CanonicalFinancials } from "@valuation-bot/canonical";

/** One canonical line item and the single Yahoo `quoteSummary` field name that supplies it. */
export interface ConceptDef {
  /** Canonical, cross-market/cross-source tag, e.g. "revenue", "netIncome". */
  tag: string;
  /** Human-readable label for the line item. */
  label: string;
  /** Field name on the raw Yahoo statement-history row. */
  field: string;
}

/** Yahoo `quoteSummary` field name -> canonical tag/label for all three core statements. */
export const CONCEPT_MAP: Record<keyof CanonicalFinancials, ConceptDef[]> = {
  incomeStatement: [
    { tag: "revenue", label: "Revenue", field: "totalRevenue" },
    { tag: "costOfRevenue", label: "Cost of revenue", field: "costOfRevenue" },
    { tag: "grossProfit", label: "Gross profit", field: "grossProfit" },
    { tag: "researchAndDevelopment", label: "Research and development expense", field: "researchDevelopment" },
    {
      tag: "sellingGeneralAndAdministrative",
      label: "Selling, general and administrative expense",
      field: "sellingGeneralAdministrative",
    },
    { tag: "operatingExpenses", label: "Operating expenses", field: "totalOperatingExpenses" },
    { tag: "operatingIncome", label: "Operating income", field: "operatingIncome" },
    { tag: "interestExpense", label: "Interest expense", field: "interestExpense" },
    { tag: "incomeBeforeTax", label: "Income before income taxes", field: "incomeBeforeTax" },
    { tag: "incomeTaxExpense", label: "Income tax expense (benefit)", field: "incomeTaxExpense" },
    { tag: "netIncome", label: "Net income", field: "netIncome" },
  ],
  balanceSheet: [
    { tag: "cashAndCashEquivalents", label: "Cash and cash equivalents", field: "cash" },
    { tag: "shortTermInvestments", label: "Short-term investments", field: "shortTermInvestments" },
    { tag: "accountsReceivable", label: "Accounts receivable, net", field: "netReceivables" },
    { tag: "inventory", label: "Inventory, net", field: "inventory" },
    { tag: "totalCurrentAssets", label: "Total current assets", field: "totalCurrentAssets" },
    { tag: "propertyPlantAndEquipmentNet", label: "Property, plant and equipment, net", field: "propertyPlantEquipment" },
    { tag: "goodwill", label: "Goodwill", field: "goodWill" },
    { tag: "intangibleAssets", label: "Intangible assets, net (excluding goodwill)", field: "intangibleAssets" },
    { tag: "totalAssets", label: "Total assets", field: "totalAssets" },
    { tag: "accountsPayable", label: "Accounts payable", field: "accountsPayable" },
    { tag: "shortTermDebt", label: "Short-term debt / current portion of long-term debt", field: "shortLongTermDebt" },
    { tag: "totalCurrentLiabilities", label: "Total current liabilities", field: "totalCurrentLiabilities" },
    { tag: "longTermDebt", label: "Long-term debt, noncurrent", field: "longTermDebt" },
    { tag: "totalLiabilities", label: "Total liabilities", field: "totalLiab" },
    { tag: "commonStockValue", label: "Common stock value", field: "commonStock" },
    { tag: "retainedEarnings", label: "Retained earnings (accumulated deficit)", field: "retainedEarnings" },
    { tag: "totalEquity", label: "Total stockholders' equity", field: "totalStockholderEquity" },
  ],
  cashFlow: [
    {
      tag: "netCashFromOperating",
      label: "Net cash provided by (used in) operating activities",
      field: "totalCashFromOperatingActivities",
    },
    { tag: "depreciationAndAmortization", label: "Depreciation and amortization", field: "depreciation" },
    { tag: "capitalExpenditures", label: "Capital expenditures (payments to acquire PP&E)", field: "capitalExpenditures" },
    {
      tag: "netCashFromInvesting",
      label: "Net cash provided by (used in) investing activities",
      field: "totalCashflowsFromInvestingActivities",
    },
    { tag: "dividendsPaid", label: "Dividends paid", field: "dividendsPaid" },
    { tag: "shareRepurchases", label: "Repurchases of common stock", field: "repurchaseOfStock" },
    {
      tag: "netCashFromFinancing",
      label: "Net cash provided by (used in) financing activities",
      field: "totalCashFromFinancingActivities",
    },
  ],
};
