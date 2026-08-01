/**
 * Mapping from Alpha Vantage's as-returned statement field names to the
 * canonical line-item tags for the three core statements.
 *
 * Unlike FMP (one stable field name per concept), Alpha Vantage's fundamental
 * data has a handful of concepts reported under more than one field name
 * depending on the endpoint revision (e.g. `costOfRevenue` vs.
 * `costofGoodsAndServicesSold`, `longTermDebt` vs. `longTermDebtNoncurrent`).
 * `ConceptDef.fields` is therefore an ordered candidate list - the first
 * field present (and numeric) on a row wins - mirroring
 * `@valuation-bot/edgar-adapter`'s candidate-concept approach rather than
 * `@valuation-bot/fmp-adapter`'s single-field one.
 *
 * Tags reuse the exact vocabulary `@valuation-bot/edgar-adapter` and
 * `@valuation-bot/fmp-adapter` use for the same concepts (e.g. "netIncome",
 * "totalAssets") so the orchestrator can merge/compare same-tag fields across
 * tiers/sources. Only concepts Alpha Vantage's fundamentals actually report
 * are mapped - EPS/share-count fields live on Alpha Vantage's separate
 * EARNINGS endpoint, out of scope here, so they're intentionally absent
 * rather than mapped to a field that never appears.
 *
 * This module is pure data - no I/O - so it can be inspected and unit-tested
 * on its own.
 */
import type { CanonicalFinancials } from "@valuation-bot/canonical";

/** One canonical line item and the Alpha Vantage field name(s) that may supply it, in priority order. */
export interface ConceptDef {
  /** Canonical, cross-market/cross-source tag, e.g. "revenue", "netIncome". */
  tag: string;
  /** Human-readable label for the line item. */
  label: string;
  /** Candidate field names on the raw Alpha Vantage statement row, in priority order - first present (and numeric) wins. */
  fields: string[];
}

/** Alpha Vantage field name(s) -> canonical tag/label for all three core statements. */
export const CONCEPT_MAP: Record<keyof CanonicalFinancials, ConceptDef[]> = {
  incomeStatement: [
    { tag: "revenue", label: "Revenue", fields: ["totalRevenue"] },
    { tag: "costOfRevenue", label: "Cost of revenue", fields: ["costOfRevenue", "costofGoodsAndServicesSold"] },
    { tag: "grossProfit", label: "Gross profit", fields: ["grossProfit"] },
    { tag: "researchAndDevelopment", label: "Research and development expense", fields: ["researchAndDevelopment"] },
    {
      tag: "sellingGeneralAndAdministrative",
      label: "Selling, general and administrative expense",
      fields: ["sellingGeneralAndAdministrative"],
    },
    { tag: "operatingExpenses", label: "Operating expenses", fields: ["operatingExpenses"] },
    { tag: "operatingIncome", label: "Operating income", fields: ["operatingIncome"] },
    { tag: "interestExpense", label: "Interest expense", fields: ["interestExpense", "interestAndDebtExpense"] },
    { tag: "incomeBeforeTax", label: "Income before income taxes", fields: ["incomeBeforeTax"] },
    { tag: "incomeTaxExpense", label: "Income tax expense (benefit)", fields: ["incomeTaxExpense"] },
    { tag: "netIncome", label: "Net income", fields: ["netIncome"] },
  ],
  balanceSheet: [
    { tag: "cashAndCashEquivalents", label: "Cash and cash equivalents", fields: ["cashAndCashEquivalentsAtCarryingValue"] },
    { tag: "shortTermInvestments", label: "Short-term investments", fields: ["shortTermInvestments"] },
    { tag: "accountsReceivable", label: "Accounts receivable, net", fields: ["currentNetReceivables"] },
    { tag: "inventory", label: "Inventory, net", fields: ["inventory"] },
    { tag: "totalCurrentAssets", label: "Total current assets", fields: ["totalCurrentAssets"] },
    { tag: "propertyPlantAndEquipmentNet", label: "Property, plant and equipment, net", fields: ["propertyPlantEquipment"] },
    { tag: "goodwill", label: "Goodwill", fields: ["goodwill"] },
    {
      tag: "intangibleAssets",
      label: "Intangible assets, net (excluding goodwill)",
      fields: ["intangibleAssetsExcludingGoodwill", "intangibleAssets"],
    },
    { tag: "totalAssets", label: "Total assets", fields: ["totalAssets"] },
    { tag: "accountsPayable", label: "Accounts payable", fields: ["currentAccountsPayable"] },
    { tag: "shortTermDebt", label: "Short-term debt / current portion of long-term debt", fields: ["shortTermDebt", "currentDebt"] },
    { tag: "totalCurrentLiabilities", label: "Total current liabilities", fields: ["totalCurrentLiabilities"] },
    { tag: "longTermDebt", label: "Long-term debt, noncurrent", fields: ["longTermDebtNoncurrent", "longTermDebt"] },
    { tag: "totalLiabilities", label: "Total liabilities", fields: ["totalLiabilities"] },
    { tag: "commonStockValue", label: "Common stock value", fields: ["commonStock"] },
    { tag: "retainedEarnings", label: "Retained earnings (accumulated deficit)", fields: ["retainedEarnings"] },
    { tag: "totalEquity", label: "Total stockholders' equity", fields: ["totalShareholderEquity"] },
  ],
  cashFlow: [
    { tag: "netCashFromOperating", label: "Net cash provided by (used in) operating activities", fields: ["operatingCashflow"] },
    {
      tag: "depreciationAndAmortization",
      label: "Depreciation and amortization",
      fields: ["depreciationDepletionAndAmortization", "depreciationAndAmortization"],
    },
    { tag: "capitalExpenditures", label: "Capital expenditures (payments to acquire PP&E)", fields: ["capitalExpenditures"] },
    { tag: "netCashFromInvesting", label: "Net cash provided by (used in) investing activities", fields: ["cashflowFromInvestment"] },
    { tag: "dividendsPaid", label: "Dividends paid", fields: ["dividendPayout"] },
    {
      tag: "shareRepurchases",
      label: "Repurchases of common stock",
      fields: ["paymentsForRepurchaseOfCommonStock", "paymentsForRepurchaseOfEquity"],
    },
    { tag: "netCashFromFinancing", label: "Net cash provided by (used in) financing activities", fields: ["cashflowFromFinancing"] },
  ],
};
