import { describe, expect, it, vi } from "vitest";

import { fetchWithRetry, parseRetryAfterMs } from "../src/http";

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("parseRetryAfterMs", () => {
  it("parses delay-seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = () => Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
  });

  it("returns null for missing/unparseable headers", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("not-a-date")).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("returns ok on first success without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, "hello"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep });

    expect(result).toEqual({ kind: "ok", status: 200, headers: expect.any(Headers), body: "hello" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on 500 and succeeds on the next attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, "oops"))
      .mockResolvedValueOnce(jsonResponse(200, "ok"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 3 });

    expect(result).toEqual({ kind: "ok", status: 200, headers: expect.any(Headers), body: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("respects Retry-After (delay-seconds) instead of computed backoff", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, "slow down", { "Retry-After": "7" }))
      .mockResolvedValueOnce(jsonResponse(200, "ok"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 3 });

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("returns a rateLimited outcome once retries are exhausted against 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, "no", { "Retry-After": "3" }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 2 });

    expect(result.kind).toBe("rateLimited");
    if (result.kind === "rateLimited") {
      expect(result.status).toBe(429);
      expect(result.retryAfterMs).toBe(3000);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns a terminal error outcome for a non-retryable status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, "missing"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep });

    expect(result).toEqual({ kind: "error", status: 404, message: "HTTP 404" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns a terminal error outcome once retries are exhausted against 503", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, "down"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 1 });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.status).toBe(503);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("catches network errors, retries, and eventually returns an error outcome", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 2 });

    expect(result).toEqual({ kind: "error", status: null, message: "ECONNRESET" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("never throws even when fetchImpl rejects repeatedly", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchWithRetry("https://example.com", {}, { fetchImpl, sleep, maxRetries: 0 }),
    ).resolves.toMatchObject({ kind: "error" });
  });
});
