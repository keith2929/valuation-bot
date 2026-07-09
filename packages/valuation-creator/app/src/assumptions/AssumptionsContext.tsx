import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { SIA_ASSUMPTIONS, type ForecastAssumptions } from "@valuation-bot/valuation-creator";

interface AssumptionsContextValue {
  assumptions: ForecastAssumptions;
  setAssumptions: Dispatch<SetStateAction<ForecastAssumptions>>;
}

const AssumptionsContext = createContext<AssumptionsContextValue | undefined>(undefined);

export interface AssumptionsProviderProps {
  /** Initial assumptions; defaults to the SIA reference-model seed. */
  initial?: ForecastAssumptions;
  children: ReactNode;
}

export function AssumptionsProvider({ initial = SIA_ASSUMPTIONS, children }: AssumptionsProviderProps) {
  const [assumptions, setAssumptions] = useState<ForecastAssumptions>(initial);
  const value = useMemo(() => ({ assumptions, setAssumptions }), [assumptions]);
  return <AssumptionsContext.Provider value={value}>{children}</AssumptionsContext.Provider>;
}

export function useAssumptions(): AssumptionsContextValue {
  const ctx = useContext(AssumptionsContext);
  if (!ctx) {
    throw new Error("useAssumptions must be used within an <AssumptionsProvider>");
  }
  return ctx;
}
