/**
 * Row-label -> canonical tag matching for scraped HTML statement tables.
 * Unlike a vendor API (`@valuation-bot/fmp-adapter`, `@valuation-bot/yfinance-adapter`,
 * ...), a published page has no stable field names - only whatever caption
 * text the publisher chose - so matching happens against normalized label
 * text/keyword patterns instead of a fixed field key.
 *
 * Tags reuse the exact vocabulary the other adapters use for the same
 * concepts (e.g. "netIncome", "totalAssets") so the orchestrator can
 * merge/compare same-tag fields across tiers. Only concepts common enough to
 * reliably recognize by caption text across publishers are included; anything
 * else is left unmapped (`tag: null` is never emitted - an unrecognized label
 * is simply skipped, matching the "true per-field last resort" scope of this
 * tier).
 */
import type { CanonicalFinancials } from "@valuation-bot/canonical";

import type { HtmlStatementKind } from "./config";

/** One canonical concept and the label patterns (lowercased, normalized) that identify it in a scraped row. */
export interface HtmlConceptDef {
  tag: string;
  label: string;
  /** Normalized (lowercase, trimmed, whitespace-collapsed) phrases that identify this concept in a row's leading caption cell. */
  patterns: string[];
}

/** Row-label patterns -> canonical tag/label for all three core statements. */
export const HTML_CONCEPT_MAP: Record<keyof CanonicalFinancials, HtmlConceptDef[]> = {
  incomeStatement: [
    { tag: "revenue", label: "Revenue", patterns: ["total revenue", "revenue", "net sales", "total net sales"] },
    { tag: "costOfRevenue", label: "Cost of revenue", patterns: ["cost of revenue", "cost of goods sold", "cost of sales"] },
    { tag: "grossProfit", label: "Gross profit", patterns: ["gross profit"] },
    {
      tag: "researchAndDevelopment",
      label: "Research and development expense",
      patterns: ["research and development", "research & development"],
    },
    {
      tag: "sellingGeneralAndAdministrative",
      label: "Selling, general and administrative expense",
      patterns: ["selling, general and administrative", "selling general and administrative", "sg&a"],
    },
    { tag: "operatingExpenses", label: "Operating expenses", patterns: ["total operating expenses", "operating expenses"] },
    { tag: "operatingIncome", label: "Operating income", patterns: ["operating income", "income from operations"] },
    { tag: "interestExpense", label: "Interest expense", patterns: ["interest expense"] },
    {
      tag: "incomeBeforeTax",
      label: "Income before income taxes",
      patterns: ["income before income taxes", "income before taxes", "pretax income"],
    },
    {
      tag: "incomeTaxExpense",
      label: "Income tax expense (benefit)",
      patterns: ["income tax expense", "provision for income taxes", "income taxes"],
    },
    { tag: "netIncome", label: "Net income", patterns: ["net income", "net earnings"] },
  ],
  balanceSheet: [
    {
      tag: "cashAndCashEquivalents",
      label: "Cash and cash equivalents",
      patterns: ["cash and cash equivalents", "cash & equivalents", "cash and equivalents"],
    },
    { tag: "shortTermInvestments", label: "Short-term investments", patterns: ["short-term investments", "short term investments"] },
    { tag: "accountsReceivable", label: "Accounts receivable, net", patterns: ["accounts receivable", "receivables"] },
    { tag: "inventory", label: "Inventory, net", patterns: ["inventory", "inventories"] },
    { tag: "totalCurrentAssets", label: "Total current assets", patterns: ["total current assets"] },
    {
      tag: "propertyPlantAndEquipmentNet",
      label: "Property, plant and equipment, net",
      patterns: ["property, plant and equipment", "property plant and equipment", "property and equipment"],
    },
    { tag: "goodwill", label: "Goodwill", patterns: ["goodwill"] },
    { tag: "intangibleAssets", label: "Intangible assets, net (excluding goodwill)", patterns: ["intangible assets"] },
    { tag: "totalAssets", label: "Total assets", patterns: ["total assets"] },
    { tag: "accountsPayable", label: "Accounts payable", patterns: ["accounts payable"] },
    {
      tag: "shortTermDebt",
      label: "Short-term debt / current portion of long-term debt",
      patterns: ["short-term debt", "short term debt", "current portion of long-term debt"],
    },
    { tag: "totalCurrentLiabilities", label: "Total current liabilities", patterns: ["total current liabilities"] },
    { tag: "longTermDebt", label: "Long-term debt, noncurrent", patterns: ["long-term debt", "long term debt"] },
    { tag: "totalLiabilities", label: "Total liabilities", patterns: ["total liabilities"] },
    { tag: "commonStockValue", label: "Common stock value", patterns: ["common stock"] },
    { tag: "retainedEarnings", label: "Retained earnings (accumulated deficit)", patterns: ["retained earnings", "accumulated deficit"] },
    {
      tag: "totalEquity",
      label: "Total stockholders' equity",
      patterns: ["total stockholders' equity", "total stockholders equity", "total shareholders' equity", "total shareholders equity", "total equity"],
    },
  ],
  cashFlow: [
    {
      tag: "netCashFromOperating",
      label: "Net cash provided by (used in) operating activities",
      patterns: ["net cash from operating activities", "net cash provided by operating activities", "cash from operations", "operating cash flow"],
    },
    { tag: "depreciationAndAmortization", label: "Depreciation and amortization", patterns: ["depreciation and amortization", "depreciation & amortization"] },
    { tag: "capitalExpenditures", label: "Capital expenditures (payments to acquire PP&E)", patterns: ["capital expenditures", "capex", "purchases of property"] },
    {
      tag: "netCashFromInvesting",
      label: "Net cash provided by (used in) investing activities",
      patterns: ["net cash from investing activities", "net cash used in investing activities", "cash from investing"],
    },
    { tag: "dividendsPaid", label: "Dividends paid", patterns: ["dividends paid", "common dividends paid", "cash dividends paid"] },
    { tag: "shareRepurchases", label: "Repurchases of common stock", patterns: ["repurchases of common stock", "share repurchases", "common stock repurchased"] },
    {
      tag: "netCashFromFinancing",
      label: "Net cash provided by (used in) financing activities",
      patterns: ["net cash from financing activities", "net cash used in financing activities", "cash from financing"],
    },
  ],
};

/** Lowercases, trims, drops footnote markers (`(1)`, `*`, `†`), and collapses whitespace so row labels compare reliably against `patterns`. */
export function normalizeHtmlLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(\d+\)/g, "")
    .replace(/[*†‡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches a scraped row's label to the canonical concept it most likely
 * represents, or `null` if nothing matches confidently. An exact match
 * against a pattern wins outright; otherwise the longest substring pattern
 * match wins, so a more specific caption (e.g. "total operating expenses")
 * isn't shadowed by a shorter, coincidentally-contained one from another
 * concept.
 */
export function matchHtmlConceptTag(label: string, statementKind: HtmlStatementKind): HtmlConceptDef | null {
  const normalized = normalizeHtmlLabel(label);
  if (!normalized) return null;

  const concepts = HTML_CONCEPT_MAP[statementKind];

  const exact = concepts.find((concept) => concept.patterns.includes(normalized));
  if (exact) return exact;

  let best: { concept: HtmlConceptDef; length: number } | null = null;
  for (const concept of concepts) {
    for (const pattern of concept.patterns) {
      if (normalized.includes(pattern) && (!best || pattern.length > best.length)) {
        best = { concept, length: pattern.length };
      }
    }
  }
  return best?.concept ?? null;
}
