/**
 * Obtains the short-lived "crumb" token + consent cookie Yahoo's unofficial
 * `quoteSummary` endpoint requires on every request - the one real dependency
 * this Tier 3 adapter has, and the piece most likely to break or get blocked
 * since it isn't a documented, versioned API. Modeled on what `yfinance`
 * itself does: fetch `consentCookieUrl` once to obtain a cookie, then present
 * that cookie to `crumbUrl` to obtain the crumb.
 *
 * Never throws: every failure - a network error, a non-2xx response, a
 * missing `Set-Cookie` header, an empty crumb body - resolves to an
 * `unavailable` outcome. That is this adapter's self-disabling path: callers
 * treat `unavailable` as "this optional source has nothing to offer right
 * now" and continue without it, exactly like a missing API key on a Tier 2
 * adapter's `isAvailable` check, just discovered a step later since a crumb
 * can only be obtained asynchronously.
 */
import { fetchWithRetry, type HttpRetryConfig } from "@valuation-bot/source-adapter";

export interface SessionConfig {
  consentCookieUrl: string;
  crumbUrl: string;
  http: HttpRetryConfig;
}

export type SessionOutcome =
  | { kind: "ok"; crumb: string; cookie: string }
  | { kind: "unavailable"; message: string }
  | { kind: "rateLimited"; retryAfterMs: number | null };

/** Extracts the `name=value` pairs from one or more `Set-Cookie` header values, joined for reuse as a `Cookie` request header. */
export function buildCookieHeader(setCookieValues: string[]): string | null {
  const pairs = setCookieValues.map((value) => value.split(";")[0]?.trim()).filter((pair): pair is string => Boolean(pair));
  return pairs.length > 0 ? pairs.join("; ") : null;
}

/** Reads every `Set-Cookie` value off a `Headers` object, using `getSetCookie()` where available (it correctly splits multiple cookies; `get("set-cookie")` does not). */
function readSetCookieValues(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Fetches the consent cookie then the crumb. Resolves `unavailable` (never
 * throws/rejects) if either step fails for any reason other than a 429, in
 * which case it resolves `rateLimited` instead so the caller can treat this
 * the same way it treats a rate-limited data request.
 */
export async function fetchSession(config: SessionConfig): Promise<SessionOutcome> {
  const cookieOutcome = await fetchWithRetry(config.consentCookieUrl, {}, config.http);
  if (cookieOutcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: cookieOutcome.retryAfterMs };
  }
  if (cookieOutcome.kind === "error") {
    return { kind: "unavailable", message: `could not obtain consent cookie: ${cookieOutcome.message}` };
  }

  const cookie = buildCookieHeader(readSetCookieValues(cookieOutcome.headers));
  if (cookie === null) {
    return { kind: "unavailable", message: "consent cookie endpoint returned no Set-Cookie header" };
  }

  const crumbOutcome = await fetchWithRetry(config.crumbUrl, { headers: { Cookie: cookie } }, config.http);
  if (crumbOutcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: crumbOutcome.retryAfterMs };
  }
  if (crumbOutcome.kind === "error") {
    return { kind: "unavailable", message: `could not obtain crumb: ${crumbOutcome.message}` };
  }

  const crumb = crumbOutcome.body.trim();
  if (crumb.length === 0 || /invalid cookie/i.test(crumb)) {
    return { kind: "unavailable", message: "crumb endpoint returned no usable crumb" };
  }

  return { kind: "ok", crumb, cookie };
}
