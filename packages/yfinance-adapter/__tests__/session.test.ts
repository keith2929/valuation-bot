import { describe, expect, it } from "vitest";

import { buildCookieHeader, fetchSession, type SessionConfig } from "../src/session";

/** Minimal Response-like object exposing exactly what `fetchWithRetry` reads, plus `getSetCookie` where a test needs it. */
function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
  setCookieValues: string[] = [],
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      getSetCookie: () => setCookieValues,
    },
    text: async () => body,
  } as unknown as Response;
}

function baseConfig(fetchImpl: typeof fetch): SessionConfig {
  return {
    consentCookieUrl: "https://fc.yf.test",
    crumbUrl: "https://yf.test/getcrumb",
    http: { fetchImpl, sleep: async () => {}, maxRetries: 1, baseDelayMs: 0 },
  };
}

describe("buildCookieHeader", () => {
  it("joins the name=value pair of each Set-Cookie value, dropping attributes", () => {
    expect(buildCookieHeader(["A3=abc123; Domain=.yahoo.com; Path=/", "B=xyz; Path=/"])).toBe("A3=abc123; B=xyz");
  });

  it("returns null for no cookies", () => {
    expect(buildCookieHeader([])).toBeNull();
  });
});

describe("fetchSession", () => {
  it("resolves ok with the crumb and cookie header on a successful two-step exchange", async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.includes("fc.yf.test")) return response(200, "", {}, ["A3=abc123; Domain=.yahoo.com; Path=/"]);
      if (url.includes("getcrumb")) {
        expect((init?.headers as Record<string, string>)?.Cookie).toBe("A3=abc123");
        return response(200, "the-crumb");
      }
      return response(404, "");
    }) as unknown as typeof fetch;

    const result = await fetchSession(baseConfig(fetchImpl));
    expect(result).toEqual({ kind: "ok", crumb: "the-crumb", cookie: "A3=abc123" });
  });

  it("resolves unavailable when the cookie endpoint returns no Set-Cookie header", async () => {
    const fetchImpl = (async () => response(200, "")) as unknown as typeof fetch;
    const result = await fetchSession(baseConfig(fetchImpl));
    expect(result.kind).toBe("unavailable");
  });

  it("resolves unavailable when the crumb endpoint returns an empty body", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("fc.yf.test")) return response(200, "", {}, ["A3=abc123"]);
      return response(200, "");
    }) as unknown as typeof fetch;
    const result = await fetchSession(baseConfig(fetchImpl));
    expect(result.kind).toBe("unavailable");
  });

  it("resolves unavailable (never throws/rejects) on a network error", async () => {
    const fetchImpl = (async () => {
      throw new Error("boom: connection reset");
    }) as unknown as typeof fetch;
    const result = await fetchSession(baseConfig(fetchImpl));
    expect(result.kind).toBe("unavailable");
  });

  it("resolves rateLimited when the cookie endpoint 429s on every attempt", async () => {
    const fetchImpl = (async () => response(429, "", { "retry-after": "1" })) as unknown as typeof fetch;
    const result = await fetchSession(baseConfig(fetchImpl));
    expect(result.kind).toBe("rateLimited");
  });
});
