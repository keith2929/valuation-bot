/**
 * Mapping from us-gaap XBRL concepts to the canonical line-item tags for the
 * three core statements. Companies tag the "same" concept with different
 * us-gaap names over time and across filers, so each canonical tag lists
 * candidate concepts most-preferred-first; the first one present in a filing
 * wins.
 *
 * This module is pure data + tiny helpers - no I/O, no dependency on the
 * companyfacts fetch - so the mapping can be inspected and unit-tested on its
 * own.
 */
import type { CanonicalFinancials, CurrencyCode, ReportedUnits } from "@valuation-bot/canonical";

/** What kind of unit a concept is reported in, used to pick the right units key from a fact node. */
export type ConceptKind = "monetary" | "shares" | "perShare";

/** One canonical line item and the ordered us-gaap concepts that can supply it. */
export interface ConceptDef {
  /** Canonical, cross-market tag, e.g. "revenue", "netIncome". */
  tag: string;
  /** Human-readable fallback label if the source fact node has none. */
  label: string;
  kind: ConceptKind;
  /** us-gaap concept names, most-preferred first. */
  concepts: string[];
}

/** A statement's concept list plus whether its facts are durations (income/cash flow) or instants (balance sheet). */
export interface StatementDef {
  /** true = duration facts (have a start+end period); false = instant facts (a single as-of date). */
  duration: boolean;
  concepts: ConceptDef[];
}

/** us-gaap concept -> canonical tag map for all three core statements. */
export const CONCEPT_MAP: Record<keyof CanonicalFinancials, StatementDef> = {
  incomeStatement: {
    duration: true,
    concepts: [
      {
        tag: "revenue",
        label: "Revenue",
        kind: "monetary",
        concepts: [
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "Revenues",
          "SalesRevenueNet",
          "RevenueFromContractWithCustomerIncludingAssessedTax",
        ],
      },
      {
        tag: "costOfRevenue",
        label: "Cost of revenue",
        kind: "monetary",
        concepts: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
      },
      { tag: "grossProfit", label: "Gross profit", kind: "monetary", concepts: ["GrossProfit"] },
      {
        tag: "researchAndDevelopment",
        label: "Research and development expense",
        kind: "monetary",
        concepts: ["ResearchAndDevelopmentExpense"],
      },
      {
        tag: "sellingGeneralAndAdministrative",
        label: "Selling, general and administrative expense",
        kind: "monetary",
        concepts: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"],
      },
      {
        tag: "operatingExpenses",
        label: "Operating expenses",
        kind: "monetary",
        concepts: ["OperatingExpenses", "CostsAndExpenses"],
      },
      { tag: "operatingIncome", label: "Operating income", kind: "monetary", concepts: ["OperatingIncomeLoss"] },
      { tag: "interestExpense", label: "Interest expense", kind: "monetary", concepts: ["InterestExpense", "InterestExpenseDebt"] },
      {
        tag: "incomeBeforeTax",
        label: "Income before income taxes",
        kind: "monetary",
        concepts: [
          "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
          "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        ],
      },
      { tag: "incomeTaxExpense", label: "Income tax expense (benefit)", kind: "monetary", concepts: ["IncomeTaxExpenseBenefit"] },
      { tag: "netIncome", label: "Net income", kind: "monetary", concepts: ["NetIncomeLoss", "ProfitLoss"] },
      { tag: "epsBasic", label: "Earnings per share, basic", kind: "perShare", concepts: ["EarningsPerShareBasic"] },
      { tag: "epsDiluted", label: "Earnings per share, diluted", kind: "perShare", concepts: ["EarningsPerShareDiluted"] },
      {
        tag: "weightedAverageSharesBasic",
        label: "Weighted-average shares outstanding, basic",
        kind: "shares",
        concepts: ["WeightedAverageNumberOfSharesOutstandingBasic"],
      },
      {
        tag: "weightedAverageSharesDiluted",
        label: "Weighted-average shares outstanding, diluted",
        kind: "shares",
        concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      },
    ],
  },
  balanceSheet: {
    duration: false,
    concepts: [
      {
        tag: "cashAndCashEquivalents",
        label: "Cash and cash equivalents",
        kind: "monetary",
        concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
      },
      { tag: "shortTermInvestments", label: "Short-term investments", kind: "monetary", concepts: ["ShortTermInvestments", "MarketableSecuritiesCurrent"] },
      {
        tag: "accountsReceivable",
        label: "Accounts receivable, net",
        kind: "monetary",
        concepts: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
      },
      { tag: "inventory", label: "Inventory, net", kind: "monetary", concepts: ["InventoryNet"] },
      { tag: "totalCurrentAssets", label: "Total current assets", kind: "monetary", concepts: ["AssetsCurrent"] },
      {
        tag: "propertyPlantAndEquipmentNet",
        label: "Property, plant and equipment, net",
        kind: "monetary",
        concepts: ["PropertyPlantAndEquipmentNet"],
      },
      { tag: "goodwill", label: "Goodwill", kind: "monetary", concepts: ["Goodwill"] },
      {
        tag: "intangibleAssets",
        label: "Intangible assets, net (excluding goodwill)",
        kind: "monetary",
        concepts: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
      },
      { tag: "totalAssets", label: "Total assets", kind: "monetary", concepts: ["Assets"] },
      { tag: "accountsPayable", label: "Accounts payable", kind: "monetary", concepts: ["AccountsPayableCurrent"] },
      {
        tag: "shortTermDebt",
        label: "Short-term debt / current portion of long-term debt",
        kind: "monetary",
        concepts: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
      },
      { tag: "totalCurrentLiabilities", label: "Total current liabilities", kind: "monetary", concepts: ["LiabilitiesCurrent"] },
      {
        tag: "longTermDebt",
        label: "Long-term debt, noncurrent",
        kind: "monetary",
        concepts: ["LongTermDebtNoncurrent", "LongTermDebt"],
      },
      { tag: "totalLiabilities", label: "Total liabilities", kind: "monetary", concepts: ["Liabilities"] },
      { tag: "commonStockValue", label: "Common stock value", kind: "monetary", concepts: ["CommonStockValue"] },
      {
        tag: "retainedEarnings",
        label: "Retained earnings (accumulated deficit)",
        kind: "monetary",
        concepts: ["RetainedEarningsAccumulatedDeficit"],
      },
      {
        tag: "totalEquity",
        label: "Total stockholders' equity",
        kind: "monetary",
        concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
      },
    ],
  },
  cashFlow: {
    duration: true,
    concepts: [
      {
        tag: "netCashFromOperating",
        label: "Net cash provided by (used in) operating activities",
        kind: "monetary",
        concepts: [
          "NetCashProvidedByUsedInOperatingActivities",
          "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
      },
      {
        tag: "depreciationAndAmortization",
        label: "Depreciation and amortization",
        kind: "monetary",
        concepts: [
          "DepreciationDepletionAndAmortization",
          "DepreciationAmortizationAndAccretionNet",
          "DepreciationAndAmortization",
        ],
      },
      {
        tag: "capitalExpenditures",
        label: "Capital expenditures (payments to acquire PP&E)",
        kind: "monetary",
        concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
      },
      {
        tag: "netCashFromInvesting",
        label: "Net cash provided by (used in) investing activities",
        kind: "monetary",
        concepts: [
          "NetCashProvidedByUsedInInvestingActivities",
          "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
        ],
      },
      {
        tag: "dividendsPaid",
        label: "Dividends paid",
        kind: "monetary",
        concepts: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
      },
      {
        tag: "shareRepurchases",
        label: "Repurchases of common stock",
        kind: "monetary",
        concepts: ["PaymentsForRepurchaseOfCommonStock"],
      },
      {
        tag: "netCashFromFinancing",
        label: "Net cash provided by (used in) financing activities",
        kind: "monetary",
        concepts: [
          "NetCashProvidedByUsedInFinancingActivities",
          "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
        ],
      },
    ],
  },
};

/**
 * Interprets a SEC XBRL units key. The companyfacts API always reports
 * as-filed magnitudes (dollars, not thousands), so the scale is always
 * "ones"; the key itself carries the currency ("USD"), the "shares" marker,
 * or a per-share ratio ("USD/shares"). Returns the canonical scale plus the
 * currency when one is embedded.
 */
export function parseUnitKey(unitKey: string): { units: ReportedUnits; currency: CurrencyCode | null } {
  if (unitKey === "shares" || unitKey === "pure") return { units: "ones", currency: null };
  const slashIndex = unitKey.indexOf("/");
  const numerator = slashIndex >= 0 ? unitKey.slice(0, slashIndex) : unitKey;
  if (/^[A-Z]{3}$/.test(numerator)) return { units: "ones", currency: numerator };
  return { units: "ones", currency: null };
}

/**
 * Chooses which units key of a fact node to read, given the concept's kind.
 * A monetary concept prefers a 3-letter currency key; a per-share concept the
 * `.../shares` ratio; a share count the plain "shares" key. Falls back to the
 * first available key so nothing is silently dropped.
 */
export function pickUnitKey(unitKeys: string[], kind: ConceptKind): string | null {
  if (unitKeys.length === 0) return null;
  if (kind === "perShare") {
    const perShare = unitKeys.find((key) => /\/shares$/i.test(key));
    if (perShare) return perShare;
  }
  if (kind === "shares") {
    const shares = unitKeys.find((key) => key === "shares");
    if (shares) return shares;
  }
  const currency = unitKeys.find((key) => /^[A-Z]{3}$/.test(key));
  if (currency) return currency;
  return unitKeys[0] ?? null;
}
