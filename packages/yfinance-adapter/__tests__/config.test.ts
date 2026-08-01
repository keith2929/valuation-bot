import { describe, expect, it } from "vitest";

import { isEnabled, resolveYfinanceConfig } from "../src/config";

describe("isEnabled", () => {
  it("is true by default and for any config not explicitly disabling it", () => {
    expect(isEnabled(undefined)).toBe(true);
    expect(isEnabled(null)).toBe(true);
    expect(isEnabled({})).toBe(true);
    expect(isEnabled({ enabled: true })).toBe(true);
  });

  it("is false only when explicitly disabled", () => {
    expect(isEnabled({ enabled: false })).toBe(false);
  });
});

describe("resolveYfinanceConfig", () => {
  it("applies defaults when no options are supplied", () => {
    const resolved = resolveYfinanceConfig({});
    expect(resolved.enabled).toBe(true);
    expect(resolved.quoteSummaryBaseUrl).toBe("https://query1.finance.yahoo.com/v10/finance/quoteSummary");
    expect(resolved.crumbUrl).toBe("https://query1.finance.yahoo.com/v1/test/getcrumb");
    expect(resolved.consentCookieUrl).toBe("https://fc.yahoo.com");
    expect(resolved.maxAnnualPeriods).toBe(4);
    expect(resolved.maxQuarterlyPeriods).toBe(4);
  });

  it("honors overrides", () => {
    const resolved = resolveYfinanceConfig({
      enabled: false,
      quoteSummaryBaseUrl: "https://yf.test/quoteSummary",
      maxAnnualPeriods: 6,
    });
    expect(resolved.enabled).toBe(false);
    expect(resolved.quoteSummaryBaseUrl).toBe("https://yf.test/quoteSummary");
    expect(resolved.maxAnnualPeriods).toBe(6);
  });
});
