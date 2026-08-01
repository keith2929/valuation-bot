import type { PolygonFinancialsRow } from "../../src/financials";

/** Two annual (10-K-derived) rows for a fictional ticker, oldest-first. */
export const FINANCIALS_ANNUAL: PolygonFinancialsRow[] = [
  {
    cik: "0000000001",
    company_name: "Test Fixture Inc.",
    start_date: "2021-09-26",
    end_date: "2022-09-24",
    filing_date: "2022-10-28",
    fiscal_period: "FY",
    fiscal_year: "2022",
    timeframe: "annual",
    financials: {
      income_statement: {
        revenues: { value: 394328000000, unit: "USD", label: "Revenues", order: 100 },
        cost_of_revenue: { value: 223546000000, unit: "USD", label: "Cost of revenue", order: 200 },
        gross_profit: { value: 170782000000, unit: "USD", label: "Gross profit", order: 300 },
        operating_income_loss: { value: 119437000000, unit: "USD", label: "Operating income", order: 400 },
        net_income_loss: { value: 99803000000, unit: "USD", label: "Net income", order: 500 },
        basic_earnings_per_share: { value: 6.15, unit: "USD / shares", label: "EPS, basic", order: 600 },
        diluted_earnings_per_share: { value: 6.11, unit: "USD / shares", label: "EPS, diluted", order: 700 },
        basic_average_shares: { value: 16215963000, unit: "shares", label: "Weighted-average shares, basic", order: 800 },
      },
      balance_sheet: {
        cash: { value: 23646000000, unit: "USD", label: "Cash and cash equivalents", order: 100 },
        current_assets: { value: 135405000000, unit: "USD", label: "Total current assets", order: 200 },
        assets: { value: 352755000000, unit: "USD", label: "Total assets", order: 300 },
        current_liabilities: { value: 153982000000, unit: "USD", label: "Total current liabilities", order: 400 },
        liabilities: { value: 302083000000, unit: "USD", label: "Total liabilities", order: 500 },
        equity_attributable_to_parent: { value: 50672000000, unit: "USD", label: "Total stockholders' equity", order: 600 },
      },
      cash_flow_statement: {
        net_cash_flow_from_operating_activities: { value: 122151000000, unit: "USD", label: "Net cash from operating activities", order: 100 },
        net_cash_flow_from_investing_activities: { value: 22354000000, unit: "USD", label: "Net cash from investing activities", order: 200 },
        net_cash_flow_from_financing_activities: { value: -110749000000, unit: "USD", label: "Net cash from financing activities", order: 300 },
      },
    },
  },
  {
    cik: "0000000001",
    company_name: "Test Fixture Inc.",
    start_date: "2022-09-25",
    end_date: "2023-09-30",
    filing_date: "2023-11-03",
    fiscal_period: "FY",
    fiscal_year: "2023",
    timeframe: "annual",
    financials: {
      income_statement: {
        revenues: { value: 383285000000, unit: "USD", label: "Revenues", order: 100 },
        cost_of_revenue: { value: 214137000000, unit: "USD", label: "Cost of revenue", order: 200 },
        gross_profit: { value: 169148000000, unit: "USD", label: "Gross profit", order: 300 },
        research_and_development: { value: 29915000000, unit: "USD", label: "Research and development", order: 350 },
        selling_general_and_administrative_expenses: {
          value: 24932000000,
          unit: "USD",
          label: "Selling, general and administrative expenses",
          order: 370,
        },
        operating_expenses: { value: 54847000000, unit: "USD", label: "Operating expenses", order: 380 },
        operating_income_loss: { value: 114301000000, unit: "USD", label: "Operating income", order: 400 },
        interest_expense_operating: { value: 3933000000, unit: "USD", label: "Interest expense", order: 420 },
        income_loss_from_continuing_operations_before_tax: {
          value: 113736000000,
          unit: "USD",
          label: "Income before income taxes",
          order: 440,
        },
        income_tax_expense_benefit: { value: 16741000000, unit: "USD", label: "Income tax expense", order: 460 },
        net_income_loss: { value: 96995000000, unit: "USD", label: "Net income", order: 500 },
        basic_earnings_per_share: { value: 6.16, unit: "USD / shares", label: "EPS, basic", order: 600 },
        diluted_earnings_per_share: { value: 6.13, unit: "USD / shares", label: "EPS, diluted", order: 700 },
        basic_average_shares: { value: 15744231000, unit: "shares", label: "Weighted-average shares, basic", order: 800 },
        diluted_average_shares: { value: 15812547000, unit: "shares", label: "Weighted-average shares, diluted", order: 810 },
      },
      balance_sheet: {
        cash: { value: 29965000000, unit: "USD", label: "Cash and cash equivalents", order: 100 },
        current_assets: { value: 143566000000, unit: "USD", label: "Total current assets", order: 200 },
        assets: { value: 352583000000, unit: "USD", label: "Total assets", order: 300 },
        current_liabilities: { value: 145308000000, unit: "USD", label: "Total current liabilities", order: 400 },
        liabilities: { value: 290437000000, unit: "USD", label: "Total liabilities", order: 500 },
        equity_attributable_to_parent: { value: 62146000000, unit: "USD", label: "Total stockholders' equity", order: 600 },
      },
      cash_flow_statement: {
        net_cash_flow_from_operating_activities: { value: 110543000000, unit: "USD", label: "Net cash from operating activities", order: 100 },
        net_cash_flow_from_investing_activities: { value: 3705000000, unit: "USD", label: "Net cash from investing activities", order: 200 },
        net_cash_flow_from_financing_activities: { value: -108488000000, unit: "USD", label: "Net cash from financing activities", order: 300 },
      },
    },
  },
];

/** One quarterly row; intentionally omits balance-sheet/cash-flow fields to exercise MISSING_CONCEPT. */
export const FINANCIALS_QUARTERLY: PolygonFinancialsRow[] = [
  {
    cik: "0000000001",
    company_name: "Test Fixture Inc.",
    start_date: "2023-07-01",
    end_date: "2023-09-30",
    filing_date: "2023-11-03",
    fiscal_period: "Q4",
    fiscal_year: "2023",
    timeframe: "quarterly",
    financials: {
      income_statement: {
        revenues: { value: 89498000000, unit: "USD", label: "Revenues", order: 100 },
        net_income_loss: { value: 22956000000, unit: "USD", label: "Net income", order: 500 },
      },
    },
  },
];
