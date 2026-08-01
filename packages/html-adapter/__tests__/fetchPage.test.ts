import { describe, expect, it } from "vitest";

import { resolveHtmlConfig } from "../src/config";
import { fetchStatementPage, isHtmlPageOk } from "../src/fetchPage";

function fakeFetch(handler: (url: string) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

describe("fetchStatementPage", () => {
  it("returns the page HTML on a 200 response, built off the resolved base URL", async () => {
    const config = resolveHtmlConfig({
      baseUrl: "https://example.test/stocks",
      http: { fetchImpl: fakeFetch(() => new Response("<html>ok</html>", { status: 200 })) },
    });

    const result = await fetchStatementPage("AAPL", "incomeStatement", config);

    expect(isHtmlPageOk(result)).toBe(true);
    if (isHtmlPageOk(result)) {
      expect(result.html).toBe("<html>ok</html>");
      expect(result.url).toBe("https://example.test/stocks/AAPL/financials/");
    }
  });

  it("resolves to an error outcome (never throws/rejects) on a 404", async () => {
    const config = resolveHtmlConfig({
      http: { fetchImpl: fakeFetch(() => new Response("not found", { status: 404 })) },
    });

    const result = await fetchStatementPage("NOSUCHTICKER", "balanceSheet", config);

    expect(result).toMatchObject({ kind: "error" });
  });

  it("resolves to the shared RateLimited sentinel when every retry hits 429", async () => {
    const config = resolveHtmlConfig({
      http: {
        maxRetries: 0,
        fetchImpl: fakeFetch(() => new Response("slow down", { status: 429 })),
      },
    });

    const result = await fetchStatementPage("AAPL", "cashFlow", config);

    expect(result).toMatchObject({ rateLimited: true, source: "html" });
  });

  it("never throws on a network error", async () => {
    const config = resolveHtmlConfig({
      http: {
        maxRetries: 0,
        fetchImpl: (async () => {
          throw new Error("network down");
        }) as typeof fetch,
      },
    });

    await expect(fetchStatementPage("AAPL", "incomeStatement", config)).resolves.toMatchObject({ kind: "error" });
  });
});
