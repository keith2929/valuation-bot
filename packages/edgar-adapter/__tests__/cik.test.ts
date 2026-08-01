import { describe, expect, it } from "vitest";

import {
  buildCikIndex,
  companyFactsUrl,
  lookupCik,
  normalizeTickerForLookup,
  padCik,
  resolveCikFromFile,
} from "../src/cik";
import { COMPANY_TICKERS_FIXTURE } from "./fixtures/companyTickers";

describe("normalizeTickerForLookup", () => {
  it("upper-cases, trims, and folds dotted share classes to hyphens", () => {
    expect(normalizeTickerForLookup(" brk.b ")).toBe("BRK-B");
    expect(normalizeTickerForLookup("aapl")).toBe("AAPL");
  });
});

describe("resolveCikFromFile", () => {
  it("resolves a bare ticker case-insensitively", () => {
    expect(resolveCikFromFile(COMPANY_TICKERS_FIXTURE, "aapl")).toEqual({
      cik: 320193,
      ticker: "AAPL",
      title: "Apple Inc.",
    });
  });

  it("matches a dotted share-class query against the SEC's hyphen form", () => {
    const record = resolveCikFromFile(COMPANY_TICKERS_FIXTURE, "BRK.B");
    expect(record?.cik).toBe(1067983);
    expect(record?.ticker).toBe("BRK-B");
  });

  it("returns null for an unknown (non-US) ticker", () => {
    expect(resolveCikFromFile(COMPANY_TICKERS_FIXTURE, "D05")).toBeNull();
  });

  it("ignores malformed rows without throwing", () => {
    const index = buildCikIndex({
      "0": { cik_str: 1, ticker: "OK", title: "Fine" },
      "1": undefined,
      // @ts-expect-error intentionally malformed row
      "2": { ticker: "NOPE" },
    });
    expect(lookupCik(index, "OK")?.cik).toBe(1);
    expect(lookupCik(index, "NOPE")).toBeNull();
  });
});

describe("padCik / companyFactsUrl", () => {
  it("zero-pads a CIK to 10 digits", () => {
    expect(padCik(320193)).toBe("0000320193");
  });

  it("builds the companyfacts URL against a base, tolerating a trailing slash", () => {
    expect(companyFactsUrl("https://data.sec.gov/api/xbrl/companyfacts", 320193)).toBe(
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
    );
    expect(companyFactsUrl("https://data.sec.gov/api/xbrl/companyfacts/", 789019)).toBe(
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json",
    );
  });
});
