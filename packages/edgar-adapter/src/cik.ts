/**
 * Ticker -> CIK resolution against the SEC's public `company_tickers.json`
 * mapping. Pure parsing/lookup only - the HTTP fetch lives in the adapter so
 * this stays trivially testable with a fixture object.
 *
 * The SEC file is a JSON object keyed by an arbitrary row index, each row
 * `{ cik_str, ticker, title }`. Tickers there use a hyphen for share classes
 * (e.g. "BRK-B"), whereas callers/vendors often use a dot ("BRK.B"), so
 * lookups normalize both sides to a common form.
 */

/** One row of the SEC `company_tickers.json` file. */
export interface CompanyTickerRecord {
  cik_str: number;
  ticker: string;
  title: string;
}

/** The shape of `company_tickers.json`: an object keyed by row index. */
export type CompanyTickersFile = Record<string, CompanyTickerRecord | undefined>;

/** A resolved company identity. */
export interface CikRecord {
  /** Numeric CIK as reported by the SEC (not zero-padded). */
  cik: number;
  /** The ticker exactly as the SEC lists it (may use a hyphen share-class form). */
  ticker: string;
  /** The registrant's name/title. */
  title: string;
}

/**
 * Normalizes a ticker for case/format-insensitive matching: upper-cased with
 * share-class dots folded to hyphens so "brk.b", "BRK.B", and "BRK-B" all
 * collide on the same key.
 */
export function normalizeTickerForLookup(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

/**
 * Builds a lookup from normalized ticker to `CikRecord`. Later rows do not
 * overwrite earlier ones for the same ticker (the SEC file has occasional
 * duplicates; first wins, which keeps the result stable).
 */
export function buildCikIndex(file: CompanyTickersFile): Map<string, CikRecord> {
  const index = new Map<string, CikRecord>();
  for (const row of Object.values(file)) {
    if (!row || typeof row.cik_str !== "number" || typeof row.ticker !== "string") continue;
    const key = normalizeTickerForLookup(row.ticker);
    if (index.has(key)) continue;
    index.set(key, { cik: row.cik_str, ticker: row.ticker, title: typeof row.title === "string" ? row.title : row.ticker });
  }
  return index;
}

/** Looks up a ticker in a prebuilt index, applying the same normalization used to build it. */
export function lookupCik(index: Map<string, CikRecord>, ticker: string): CikRecord | null {
  return index.get(normalizeTickerForLookup(ticker)) ?? null;
}

/** Convenience: build the index and look up in one call. */
export function resolveCikFromFile(file: CompanyTickersFile, ticker: string): CikRecord | null {
  return lookupCik(buildCikIndex(file), ticker);
}

/** Zero-pads a numeric CIK to the 10-digit form the companyfacts endpoint expects, e.g. 320193 -> "0000320193". */
export function padCik(cik: number): string {
  return String(cik).padStart(10, "0");
}

/** Builds the companyfacts URL for a CIK against a configured base. */
export function companyFactsUrl(baseUrl: string, cik: number): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/CIK${padCik(cik)}.json`;
}
