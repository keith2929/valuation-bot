import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CompanyRef, Exchange } from "@valuation-bot/contract";
import { useMarketDataProvider } from "../providers/ProviderContext";

/** Default company loaded on app start (masterprompt reference model). */
export const DEFAULT_TICKER = "C6L";
export const DEFAULT_EXCHANGE: Exchange = "SGX";

export type CompanyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; company: CompanyRef };

interface CompanyContextValue {
  state: CompanyState;
  selectCompany: (ticker: string, exchange: Exchange) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const provider = useMarketDataProvider();
  const [state, setState] = useState<CompanyState>({ status: "loading" });

  const selectCompany = useCallback(
    async (ticker: string, exchange: Exchange) => {
      setState({ status: "loading" });
      try {
        const company = await provider.searchTicker(ticker, exchange);
        setState({ status: "ready", company });
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    },
    [provider],
  );

  useEffect(() => {
    void selectCompany(DEFAULT_TICKER, DEFAULT_EXCHANGE);
  }, [selectCompany]);

  return <CompanyContext.Provider value={{ state, selectCompany }}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used within a <CompanyProvider>");
  }
  return ctx;
}
