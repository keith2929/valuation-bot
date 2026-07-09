import { describe, expect, it, vi } from "vitest";
import { ResponseCache } from "../providers/ResponseCache";

describe("ResponseCache", () => {
  it("returns the cached value on a repeat call for the same scope + call type", async () => {
    const cache = new ResponseCache();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    const first = await cache.getOrFetch("SGX:C6L", "getFinancials", fetcher);
    const second = await cache.getOrFetch("SGX:C6L", "getFinancials", fetcher);

    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight calls for the same scope + call type", async () => {
    const cache = new ResponseCache();
    let resolveFetch: (value: number) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const pendingA = cache.getOrFetch("SGX:C6L", "getMarketData", fetcher);
    const pendingB = cache.getOrFetch("SGX:C6L", "getMarketData", fetcher);
    resolveFetch(42);

    expect(await pendingA).toBe(42);
    expect(await pendingB).toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keys by call type, so getFinancials and getMarketData for the same company don't collide", async () => {
    const cache = new ResponseCache();
    await cache.getOrFetch("SGX:C6L", "getFinancials", () => Promise.resolve("financials"));
    await cache.getOrFetch("SGX:C6L", "getMarketData", () => Promise.resolve("market"));

    expect(cache.size).toBe(2);
    expect(cache.has("SGX:C6L", "getFinancials")).toBe(true);
    expect(cache.has("SGX:C6L", "getMarketData")).toBe(true);
  });

  it("keys by scope, so two companies never share a cache entry", async () => {
    const cache = new ResponseCache();
    await cache.getOrFetch("SGX:C6L", "getFinancials", () => Promise.resolve("sia"));
    await cache.getOrFetch("NYSE:DAL", "getFinancials", () => Promise.resolve("delta"));

    expect(cache.size).toBe(2);
  });

  it("does not cache a failed fetch, so the next call retries", async () => {
    const cache = new ResponseCache();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("recovered");

    await expect(cache.getOrFetch("SGX:C6L", "getFinancials", fetcher)).rejects.toThrow("boom");
    await expect(cache.getOrFetch("SGX:C6L", "getFinancials", fetcher)).resolves.toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
