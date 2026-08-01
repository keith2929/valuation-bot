import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MarketDataProvider } from "@valuation-bot/contract";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { CachedMarketDataProvider } from "./CachedMarketDataProvider";
import { LiveApiProvider } from "./LiveApiProvider";

const ProviderContext = createContext<MarketDataProvider | undefined>(undefined);

export interface DataProviderProps {
  /**
   * Override for the underlying MarketDataProvider -- pass a
   * `new CachedMarketDataProvider(new ExtractionProvider(store))` (or any
   * other MarketDataProvider implementation) to swap data sources without
   * touching core or any view. Defaults to a cached FixtureProvider.
   */
  provider?: MarketDataProvider | undefined;
  children: ReactNode;
}

export function DataProvider({ provider, children }: DataProviderProps) {
  const value = useMemo(() => {
    if (provider) return provider;
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
    return new CachedMarketDataProvider(apiBaseUrl ? new LiveApiProvider(apiBaseUrl) : new FixtureProvider());
  }, [provider]);
  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

export function useMarketDataProvider(): MarketDataProvider {
  const provider = useContext(ProviderContext);
  if (!provider) {
    throw new Error("useMarketDataProvider must be used within a <DataProvider>");
  }
  return provider;
}
