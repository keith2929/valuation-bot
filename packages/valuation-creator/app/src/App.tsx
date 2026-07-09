import { DataProvider, type DataProviderProps } from "./providers/ProviderContext";
import { CompanyProvider } from "./company/CompanyContext";
import { AssumptionsProvider } from "./assumptions/AssumptionsContext";
import { AppShell } from "./AppShell";

export interface AppProps {
  /** Test/host override, e.g. to inject a CachedMarketDataProvider(ExtractionProvider). */
  provider?: DataProviderProps["provider"];
}

export function App({ provider }: AppProps = {}) {
  return (
    <DataProvider provider={provider}>
      <CompanyProvider>
        <AssumptionsProvider>
          <AppShell />
        </AssumptionsProvider>
      </CompanyProvider>
    </DataProvider>
  );
}
