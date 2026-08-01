import { useState, type FormEvent } from "react";
import type { Exchange } from "@valuation-bot/contract";
import { useCompany } from "../company/CompanyContext";

/** Exchanges the search view supports, per the masterprompt's provider contract. */
export const EXCHANGES: Exchange[] = ["SGX", "NYSE", "NASDAQ", "SEHK", "TSE", "KOSE", "LSE"];

export function CompanySearchView() {
  const { state, selectCompany } = useCompany();
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState<Exchange>("SGX");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticker.trim()) {
      return;
    }
    void selectCompany(ticker.trim(), exchange);
  }

  return (
    <section>
      <h2>Search</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          aria-label="Ticker"
          placeholder="Ticker (e.g. C6L)"
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
        />
        <select aria-label="Exchange" value={exchange} onChange={(event) => setExchange(event.target.value as Exchange)}>
          {EXCHANGES.map((ex) => (
            <option key={ex} value={ex}>
              {ex}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
        <button type="button" onClick={() => void selectCompany("AAPL", "US")}>Load AAPL</button>
      </form>

      {state.status === "loading" && <p>Loading…</p>}

      {state.status === "error" && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      )}

      {state.status === "ready" && (
        <dl>
          <dt>Name</dt>
          <dd>{state.company.name}</dd>
          <dt>Reporting currency</dt>
          <dd>{state.company.reportingCurrency}</dd>
        </dl>
      )}
    </section>
  );
}
