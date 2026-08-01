/**
 * In-memory, TTL-based cache for the parsed SEC `company_tickers.json`
 * mapping (built into a `CikRecord` index, see `cik.ts`). The file is ~1MB
 * and only changes a handful of times a day, so refetching it on every
 * single ticker resolution (as the adapter would otherwise do, once per
 * `resolveMeta`/`fetchFinancials` call) is wasteful and needlessly exercises
 * SEC's fair-access rate limits. One cache instance is created per
 * `createEdgarAdapter(...)` call and shared across all lookups made through
 * that adapter.
 */
import type { CikRecord } from "./cik";

/** A cached index plus the time (ms epoch) it was fetched. */
interface TickerCacheEntry {
  index: Map<string, CikRecord>;
  fetchedAt: number;
}

export interface TickerCache {
  /** Returns the cached index if present and not older than the TTL, else null. */
  get(now?: number): Map<string, CikRecord> | null;
  /** Stores a freshly-fetched index, timestamped `now` (defaults to `Date.now()`). */
  set(index: Map<string, CikRecord>, now?: number): void;
  /** Drops any cached entry, forcing the next `get` to miss. */
  clear(): void;
}

/** Creates a cache that treats entries older than `ttlMs` as a miss. */
export function createTickerCache(ttlMs: number): TickerCache {
  let entry: TickerCacheEntry | null = null;

  return {
    get(now = Date.now()): Map<string, CikRecord> | null {
      if (entry === null) return null;
      if (now - entry.fetchedAt > ttlMs) return null;
      return entry.index;
    },
    set(index: Map<string, CikRecord>, now = Date.now()): void {
      entry = { index, fetchedAt: now };
    },
    clear(): void {
      entry = null;
    },
  };
}
