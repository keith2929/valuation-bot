/**
 * Mapping from FMP's as-returned statement field names to the canonical
 * line-item tags for the three core statements. Unlike a raw XBRL filing, FMP
 * already normalizes each statement to one stable field name per concept, so
 * (unlike EDGAR's candidate-list mapping) each canonical tag here has exactly
 * one source field.
 *
 * Tags reuse the exact vocabulary `@valuation-bot/edgar-adapter` uses for the
 * same concepts (e.g. "netIncome", "totalAssets") so the orchestrator can
 * merge/compare same-tag fields across tiers/sources.
 *
 * This module is pure data - no I/O - so it can be inspected and unit-tested
 * on its own.
 */
import type { CanonicalFinancials } from "@valuation-bot/canonical";

/** One canonical line item and the single FMP field name that supplies it. */
export interface ConceptDef {
  /** Canonical, cross-market/cross-source tag, e.g. "revenue", "netIncome". */
  tag: string;
  /** Human-readable label for the line item. */
  label: string;
  /** Field name on the raw FMP statement row. */
  field: string;
}

/** FMP field name -> canonical tag/label for all three core statements. */
export const CONCEPT_MAP: Record<keyof CanonicalFinancials, ConceptDef[]> = {
  incomeStatement: [
    { tag: "revenue", label: "Revenue", field: "revenue" },
    { tag: "costOfRevenue", label: "Cost of revenue", field: "costOfRevenue" },
    { tag: "grossProfit", label: "Gross profit", field: "grossProfit" },
    { tag: "researchAndDevelopment", label: "Research and development expense", field: "researchAndDevelopmentExpenses" },
    {
      tag: "sellingGeneralAndAdministrative",
      label: "Selling, general and administrative expense",
      field: "sellingGeneralAndAdministrativeExpenses",
    },
    { tag: "operatingExpenses", label: "Operating expenses", field: "operatingExpenses" },
    { tag: "operatingIncome", label: "Operating income", field: "operatingIncome" },
    { tag: "interestExpense", label: "Interest expense", field: "interestExpense" },
    { tag: "incomeBeforeTax", label: "Income before income taxes", field: "incomeBeforeTax" },
    { tag: "incomeTaxExpense", label: "Income tax expense (benefit)", field: "incomeTaxExpense" },
    { tag: "netIncome", label: "Net income", field: "netIncome" },
    { tag: "epsBasic", label: "Earnings per share, basic", field: "eps" },
    { tag: "epsDiluted", label: "Earnings per share, diluted", field: "epsdiluted" },
    { tag: "weightedAverageSharesBasic", label: "Weighted-average shares outstanding, basic", field: "weightedAverageShsOut" },
    {
      tag: "weightedAverageSharesDiluted",
      label: "Weighted-average shares outstanding, diluted",
      field: "weightedAverageShsOutDil",
    },
  ],
  balanceSheet: [
    { tag: "cashAndCashEquivalents", label: "Cash and cash equivalents", field: "cashAndCashEquivalents" },
    { tag: "shortTermInvestments", label: "Short-term investments", field: "shortTermInvestments" },
    { tag: "accountsReceivable", label: "Accounts receivable, net", field: "netReceivables" },
    { tag: "inventory", label: "Inventory, net", field: "inventory" },
    { tag: "totalCurrentAssets", label: "Total current assets", field: "totalCurrentAssets" },
    {
      tag: "propertyPlantAndEquipmentNet",
      label: "Property, plant and equipment, net",
      field: "propertyPlantEquipmentNet",
    },
    { tag: "goodwill", label: "Goodwill", field: "goodwill" },
    { tag: "intangibleAssets", label: "Intangible assets, net (excluding goodwill)", field: "intangibleAssets" },
    { tag: "totalAssets", label: "Total assets", field: "totalAssets" },
    { tag: "accountsPayable", label: "Accounts payable", field: "accountPayables" },
    { tag: "shortTermDebt", label: "Short-term debt / current portion of long-term debt", field: "shortTermDebt" },
    { tag: "totalCurrentLiabilities", label: "Total current liabilities", field: "totalCurrentLiabilities" },
    { tag: "longTermDebt", label: "Long-term debt, noncurrent", field: "longTermDebt" },
    { tag: "totalLiabilities", label: "Total liabilities", field: "totalLiabilities" },
    { tag: "commonStockValue", label: "Common stock value", field: "commonStock" },
    { tag: "retainedEarnings", label: "Retained earnings (accumulated deficit)", field: "retainedEarnings" },
    { tag: "totalEquity", label: "Total stockholders' equity", field: "totalStockholdersEquity" },
  ],
  cashFlow: [
    {
      tag: "netCashFromOperating",
      label: "Net cash provided by (used in) operating activities",
      field: "netCashProvidedByOperatingActivities",
    },
    { tag: "depreciationAndAmortization", label: "Depreciation and amortization", field: "depreciationAndAmortization" },
    { tag: "capitalExpenditures", label: "Capital expenditures (payments to acquire PP&E)", field: "capitalExpenditure" },
    {
      tag: "netCashFromInvesting",
      label: "Net cash provided by (used in) investing activities",
      field: "netCashUsedForInvestingActivites",
    },
    { tag: "dividendsPaid", label: "Dividends paid", field: "dividendsPaid" },
    { tag: "shareRepurchases", label: "Repurchases of common stock", field: "commonStockRepurchased" },
    {
      tag: "netCashFromFinancing",
      label: "Net cash provided by (used in) financing activities",
      field: "netCashUsedProvidedByFinancingActivities",
    },
  ],
};
