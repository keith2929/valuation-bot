export type ProviderCallType = "searchTicker" | "getFinancials" | "getMarketData" | "getPeer";

/**
 * Per-session cache for MarketDataProvider responses, keyed by company/peer
 * identity (CompanyRef.id, or "exchange:TICKER" before a CompanyRef exists)
 * plus call type. In-flight promises are cached too, so concurrent callers
 * for the same key/call type share one underlying request. Lives only in
 * memory for the lifetime of the app session -- nothing here is persisted.
 */
export class ResponseCache {
  private readonly entries = new Map<string, Promise<unknown>>();

  async getOrFetch<T>(scopeKey: string, callType: ProviderCallType, fetcher: () => Promise<T>): Promise<T> {
    const key = ResponseCache.key(scopeKey, callType);
    const cached = this.entries.get(key);
    if (cached) {
      return cached as Promise<T>;
    }
    const pending = fetcher().catch((error: unknown) => {
      // Don't poison the cache with a failed request -- let the next call retry.
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, pending);
    return pending;
  }

  has(scopeKey: string, callType: ProviderCallType): boolean {
    return this.entries.has(ResponseCache.key(scopeKey, callType));
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private static key(scopeKey: string, callType: ProviderCallType): string {
    return `${scopeKey}::${callType}`;
  }
}
