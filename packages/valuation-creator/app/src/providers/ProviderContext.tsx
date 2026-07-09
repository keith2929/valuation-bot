import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MarketDataProvider } from "@valuation-bot/contract";
import { FixtureProvider } from "@valuation-bot/valuation-creator";
import { CachedMarketDataProvider } from "./CachedMarketDataProvider";

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
  const value = useMemo(() => provider ?? new CachedMarketDataProvider(new FixtureProvider()), [provider]);
  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

export function useMarketDataProvider(): MarketDataProvider {
  const provider = useContext(ProviderContext);
  if (!provider) {
    throw new Error("useMarketDataProvider must be used within a <DataProvider>");
  }
  return provider;
}
