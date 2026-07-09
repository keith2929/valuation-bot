export type Exchange = 'SGX' | 'NYSE' | 'NASDAQ' | 'SEHK' | 'TSE' | 'KOSE' | 'LSE' | string;
export interface CompanyRef { id: string; name: string; ticker: string; reportingCurrency: string; }
export interface FinancialStatements {
  fiscalYears: string[];              // e.g. ["2021","2022","2023","2024","2025"]
  currency: string;
  incomeStatement: {
    revenue: number[]; cogs: number[]; sga: number[]; dandA: number[]; otherOpEx: number[];
    ebit: number[]; interestExpense: number[]; interestIncome: number[];
    incomeTaxExpense: number[]; netIncome: number[]; minorityInterest: number[];
  };
  balanceSheet: {
    cash: number[]; shortTermInvestments: number[]; receivables: number[]; inventory: number[];
    prepaid: number[]; otherCurrentAssets: number[]; netPPE: number[]; longTermInvestments: number[];
    goodwill: number[]; intangibles: number[]; otherLTAssets: number[]; totalAssets: number[];
    accountsPayable: number[]; accrued: number[]; currentPortionLTDebt: number[]; currentLeases: number[];
    taxesPayable: number[]; unearnedRevCurrent: number[]; otherCurrentLiabilities: number[];
    longTermDebt: number[]; longTermLeases: number[]; pensionOPEB: number[]; deferredTaxLiability: number[];
    otherNonCurrentLiabilities: number[]; totalLiabilities: number[]; commonEquity: number[];
    retainedEarnings: number[]; minorityInterest: number[]; totalEquity: number[]; bookValueOfEquity: number[];
  };
  cashFlow: {
    dandA: number[]; capex: number[]; commonDividendsPaid: number[];
    changeReceivables: number[]; changeInventory: number[]; changePayables: number[];
    changeUnearnedRev: number[]; changeOtherNWC: number[];
  };
}
export interface MarketData {
  currentPrice: number; sharesOutstanding: number; week52High: number; week52Low: number;
  marketValueOfDebt: number; cash: number; currency: string;
}
export interface PeerData {
  name: string; ticker: string; fxToTargetCurrency: number;
  currentPrice: number; sharesOutstanding: number; cashAndSTInvestments: number; totalDebt: number;
  preferredEquity: number; minorityInterest: number; sales: number; ebitda: number; ebit: number;
  earnings: number; bookValue: number; equityBeta5Y: number; interestExpense: number;
  marginalTaxRate: number; ntmPE: number; ntmEvEbitda: number;
}
export interface MarketDataProvider {
  searchTicker(ticker: string, exchange: Exchange): Promise<CompanyRef>;
  getFinancials(id: CompanyRef): Promise<FinancialStatements>;   // >=5 fiscal years
  getMarketData(id: CompanyRef): Promise<MarketData>;
  getPeer(ticker: string, exchange: Exchange): Promise<PeerData>;
}
