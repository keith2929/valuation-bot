import type { CompanyTickersFile } from "../../src/cik";

/**
 * Trimmed stand-in for the SEC `company_tickers.json` file: a few rows keyed
 * by an arbitrary index, exactly as the real endpoint returns. "BRK-B" uses
 * the SEC's hyphen share-class convention on purpose, to exercise ticker
 * normalization against a dotted "BRK.B" query.
 */
export const COMPANY_TICKERS_FIXTURE: CompanyTickersFile = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
  "2": { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
};
