import type { CompanyFacts } from "../../src/companyFacts";

/**
 * A trimmed but structurally-faithful `companyfacts` payload for a fictional
 * Apple-like registrant (CIK 320193). It deliberately exercises the tricky
 * paths the normalizer must get right:
 *   - annual (10-K, ~365-day) vs single-quarter (10-Q, ~91-day) durations,
 *   - a 9-month YTD duration inside a 10-Q that must NOT be read as a quarter,
 *   - a restated FY2022 revenue (a later filing with a newer `filed` date and
 *     a different value must win),
 *   - balance-sheet instants tagged in both 10-Ks and 10-Qs,
 *   - a per-share (USD/shares) and a share-count (shares) concept, and
 *   - Goodwill intentionally absent, so the balance sheet reports a missing
 *     concept rather than fabricating one.
 */
export const COMPANY_FACTS_FIXTURE: CompanyFacts = {
  cik: 320193,
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        label: "Revenue from Contract with Customer, Excluding Assessed Tax",
        units: {
          USD: [
            // FY2021 (10-K, full year)
            { start: "2020-09-27", end: "2021-09-25", val: 365817000000, form: "10-K", fp: "FY", filed: "2021-10-29" },
            // FY2022 as originally filed
            { start: "2021-09-26", end: "2022-09-24", val: 394328000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            // FY2022 restated (comparative in the FY2023 10-K, later filed -> should win)
            { start: "2021-09-26", end: "2022-09-24", val: 394330000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
            // FY2023 (10-K, full year)
            { start: "2022-09-25", end: "2023-09-30", val: 383285000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
            // Q2 FY2023 (10-Q, single quarter ~91 days)
            { start: "2022-12-31", end: "2023-04-01", val: 94836000000, form: "10-Q", fp: "Q2", filed: "2023-05-05" },
            // First-half FY2023 YTD in a 10-Q (~182 days) -> must be ignored, not a quarter
            { start: "2022-10-01", end: "2023-04-01", val: 211990000000, form: "10-Q", fp: "Q2", filed: "2023-05-05" },
          ],
        },
      },
      OperatingIncomeLoss: {
        label: "Operating Income (Loss)",
        units: {
          USD: [
            { start: "2021-09-26", end: "2022-09-24", val: 119437000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { start: "2022-09-25", end: "2023-09-30", val: 114301000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      NetIncomeLoss: {
        label: "Net Income (Loss)",
        units: {
          USD: [
            { start: "2021-09-26", end: "2022-09-24", val: 99803000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { start: "2022-09-25", end: "2023-09-30", val: 96995000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
            { start: "2022-12-31", end: "2023-04-01", val: 24160000000, form: "10-Q", fp: "Q2", filed: "2023-05-05" },
          ],
        },
      },
      EarningsPerShareDiluted: {
        label: "Earnings Per Share, Diluted",
        units: {
          "USD/shares": [
            { start: "2021-09-26", end: "2022-09-24", val: 6.11, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { start: "2022-09-25", end: "2023-09-30", val: 6.13, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        label: "Weighted Average Number of Diluted Shares Outstanding",
        units: {
          shares: [
            { start: "2022-09-25", end: "2023-09-30", val: 15812547000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      Assets: {
        label: "Assets",
        units: {
          USD: [
            { end: "2022-09-24", val: 352755000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { end: "2023-09-30", val: 352583000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
            { end: "2023-04-01", val: 332160000000, form: "10-Q", fp: "Q2", filed: "2023-05-05" },
          ],
        },
      },
      Liabilities: {
        label: "Liabilities",
        units: {
          USD: [
            { end: "2022-09-24", val: 302083000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { end: "2023-09-30", val: 290437000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      StockholdersEquity: {
        label: "Stockholders' Equity",
        units: {
          USD: [
            { end: "2022-09-24", val: 50672000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { end: "2023-09-30", val: 62146000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        label: "Net Cash Provided by (Used in) Operating Activities",
        units: {
          USD: [
            { start: "2021-09-26", end: "2022-09-24", val: 122151000000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { start: "2022-09-25", end: "2023-09-30", val: 110543000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
            { start: "2022-12-31", end: "2023-04-01", val: 28560000000, form: "10-Q", fp: "Q2", filed: "2023-05-05" },
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        label: "Payments to Acquire Property, Plant, and Equipment",
        units: {
          USD: [
            { start: "2022-09-25", end: "2023-09-30", val: 10959000000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
      // Goodwill deliberately omitted -> balanceSheet.goodwill should be reported missing.
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        label: "Entity Common Stock, Shares Outstanding",
        units: {
          shares: [
            { end: "2022-10-14", val: 15908118000, form: "10-K", fp: "FY", filed: "2022-10-28" },
            { end: "2023-10-20", val: 15634232000, form: "10-K", fp: "FY", filed: "2023-11-03" },
          ],
        },
      },
    },
  },
};
