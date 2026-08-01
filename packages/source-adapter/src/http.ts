/**
 * Shared HTTP helper for source adapters. Adapters must never throw on a
 * failed request - `fetchWithRetry` resolves to a discriminated `HttpOutcome`
 * in every case (success, exhausted rate-limit, or terminal error) so callers
 * can branch without try/catch.
 */

/** Status codes that are retried with backoff before giving up. */
const DEFAULT_RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

export interface HttpRetryConfig {
  /** Per-attempt timeout in ms, after which the attempt is aborted. Default 10_000. */
  timeoutMs?: number;
  /** Number of retries after the first attempt (so maxRetries=3 means up to 4 total attempts). Default 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff when the source gives no `Retry-After`. Default 300. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff delay, including one derived from `Retry-After`. Default 30_000. */
  maxDelayMs?: number;
  /** Status codes treated as transient and worth retrying. Default: 429, 500, 502, 503, 504. */
  retryStatusCodes?: number[];
  /** Injectable `fetch` implementation, primarily for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep, primarily for tests. Defaults to a real `setTimeout`-based delay. */
  sleep?: (ms: number) => Promise<void>;
}

export interface HttpOkOutcome {
  kind: "ok";
  status: number;
  headers: Headers;
  body: string;
}

/**
 * Every retry attempt was met with a 429 (or the retry loop otherwise
 * concluded the source is rate-limiting us). Callers should treat this as a
 * signal to move on to the next source rather than fail the whole fetch.
 */
export interface HttpRateLimitedOutcome {
  kind: "rateLimited";
  status: number;
  retryAfterMs: number | null;
  message: string;
}

/** A non-retryable HTTP status, or retries exhausted against a non-429 retryable status / network error. */
export interface HttpErrorOutcome {
  kind: "error";
  status: number | null;
  message: string;
}

export type HttpOutcome = HttpOkOutcome | HttpRateLimitedOutcome | HttpErrorOutcome;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses a `Retry-After` header value, which per RFC 9110 §10.2.3 is either
 * an integer number of delay-seconds or an HTTP-date. Returns milliseconds to
 * wait, or null if the header is absent/unparseable.
 */
export function parseRetryAfterMs(headerValue: string | null, now: () => number = Date.now): number | null {
  if (headerValue === null || headerValue.trim() === "") return null;

  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds)) {
    return Math.max(0, asSeconds * 1000);
  }

  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - now());
  }

  return null;
}

function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * baseDelayMs;
  return Math.min(maxDelayMs, exponential + jitter);
}

/**
 * Fetches `url` with a per-attempt timeout and retry/backoff on 429/5xx
 * (configurable via `retryStatusCodes`). When the response carries a
 * `Retry-After` header, that value drives the wait instead of the computed
 * backoff. If every attempt against a 429 is exhausted, resolves to a
 * `rateLimited` outcome; any other unresolved failure resolves to `error`.
 * Never throws or rejects - network errors and timeouts are caught and
 * folded into the same retry loop.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  config: HttpRetryConfig = {},
): Promise<HttpOutcome> {
  const timeoutMs = config.timeoutMs ?? 10_000;
  const maxRetries = config.maxRetries ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 300;
  const maxDelayMs = config.maxDelayMs ?? 30_000;
  const retryStatusCodes = config.retryStatusCodes ?? DEFAULT_RETRY_STATUS_CODES;
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? defaultSleep;

  let lastNetworkError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetchImpl(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        const body = await response.text();
        return { kind: "ok", status: response.status, headers: response.headers, body };
      }

      if (!retryStatusCodes.includes(response.status)) {
        return { kind: "error", status: response.status, message: `HTTP ${response.status}` };
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        if (response.status === 429) {
          return {
            kind: "rateLimited",
            status: response.status,
            retryAfterMs,
            message: `HTTP 429 rate limited after ${attempt + 1} attempt(s)`,
          };
        }
        return {
          kind: "error",
          status: response.status,
          message: `HTTP ${response.status} after ${attempt + 1} attempt(s)`,
        };
      }

      const delay = retryAfterMs ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      await sleep(Math.min(delay, maxDelayMs));
    } catch (err) {
      clearTimeout(timeout);
      lastNetworkError =
        err instanceof Error && err.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err);

      if (attempt === maxRetries) {
        return { kind: "error", status: null, message: lastNetworkError };
      }

      await sleep(backoffDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }

  return { kind: "error", status: null, message: lastNetworkError ?? "exhausted retries" };
}
