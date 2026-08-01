/**
 * Fetches one published financials page as raw HTML. Thin wrapper over
 * `fetchWithRetry` - all the "never throw, retry on 429/5xx" behavior lives
 * there; this module just shapes the outcome for the HTML pipeline and
 * attaches the `User-Agent` most publishers require to avoid an outright
 * block on requests with no/blank one.
 */
import { fetchWithRetry, rateLimited } from "@valuation-bot/source-adapter";
import type { RateLimited } from "@valuation-bot/source-adapter";

import { buildStatementUrl, HTML_SOURCE } from "./config";
import type { HtmlStatementKind, ResolvedHtmlConfig } from "./config";

export interface HtmlPageOk {
  kind: "ok";
  url: string;
  html: string;
}

export interface HtmlPageError {
  kind: "error";
  url: string;
  message: string;
}

export type HtmlPageResult = HtmlPageOk | HtmlPageError | RateLimited;

export function isHtmlPageOk(result: HtmlPageResult): result is HtmlPageOk {
  return (result as HtmlPageOk).kind === "ok";
}

/**
 * Fetches the published page for `ticker`'s `statement` section. Never
 * throws: network errors, timeouts, and non-2xx statuses all resolve to
 * `HtmlPageError`; exhausted 429s resolve to the shared `RateLimited`
 * sentinel so callers can stop trying this source for now.
 */
export async function fetchStatementPage(
  ticker: string,
  statement: HtmlStatementKind,
  config: ResolvedHtmlConfig,
): Promise<HtmlPageResult> {
  const url = buildStatementUrl(ticker, statement, config);

  const outcome = await fetchWithRetry(
    url,
    { headers: { "User-Agent": config.userAgent, Accept: "text/html" } },
    config.http,
  );

  if (outcome.kind === "ok") {
    return { kind: "ok", url, html: outcome.body };
  }
  if (outcome.kind === "rateLimited") {
    return rateLimited(HTML_SOURCE, outcome.retryAfterMs);
  }
  return { kind: "error", url, message: outcome.message };
}
