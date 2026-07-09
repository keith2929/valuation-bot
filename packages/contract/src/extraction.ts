export interface ExtractionLine {
  tag: string | null;
  label: string;
  value: number | null;
  value_comparative: number | null;
}

export interface ExtractionResult {
  company_name: string;
  counter_code: string | null;
  currency: string;
  unit_multiplier: number;
  period_end: string;
  comparative_period_end: string | null;
  period_type: 'FY' | 'HY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
  consolidated: boolean;
  audited: boolean;
  statements: {
    income_statement: ExtractionLine[];
    balance_sheet: ExtractionLine[];
    cash_flow: ExtractionLine[];
  };
  extraction_warnings: string[];
}
