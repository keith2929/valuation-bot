import { describe, expect, it } from "vitest";

import { createTickerCache } from "../src/tickerCache";
import type { CikRecord } from "../src/cik";

function index(): Map<string, CikRecord> {
  return new Map([["AAPL", { cik: 320193, ticker: "AAPL", title: "Apple Inc." }]]);
}

describe("createTickerCache", () => {
  it("is a miss before anything has been set", () => {
    const cache = createTickerCache(1000);
    expect(cache.get(0)).toBeNull();
  });

  it("returns the stored index while within the TTL", () => {
    const cache = createTickerCache(1000);
    const idx = index();
    cache.set(idx, 0);
    expect(cache.get(500)).toBe(idx);
    expect(cache.get(1000)).toBe(idx);
  });

  it("expires once the TTL has elapsed", () => {
    const cache = createTickerCache(1000);
    cache.set(index(), 0);
    expect(cache.get(1001)).toBeNull();
  });

  it("clear() forces the next get to miss", () => {
    const cache = createTickerCache(1000);
    cache.set(index(), 0);
    cache.clear();
    expect(cache.get(0)).toBeNull();
  });

  it("defaults `now` to Date.now() when omitted", () => {
    const cache = createTickerCache(1000);
    const idx = index();
    cache.set(idx);
    expect(cache.get()).toBe(idx);
  });
});
