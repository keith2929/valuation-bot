import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FinancialStatements, MarketData } from "@valuation-bot/contract";
import {
  afterTaxCostOfDebt,
  costOfEquityCapm,
  hamadaBetaFromPeers,
  type HamadaFromPeersResult,
} from "@valuation-bot/valuation-creator-core";
import { SIA_BETA_PEERS, SIA_HAMADA_TARGET, type BetaPeer } from "@valuation-bot/valuation-creator";
import { useCompany } from "../company/CompanyContext";
import { useMarketDataProvider } from "../providers/ProviderContext";
import { useAssumptions } from "../assumptions/AssumptionsContext";

type MarketState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; financials: FinancialStatements; market: MarketData };

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: "0.85rem", marginBottom: "1rem" };
const thStyle: CSSProperties = { textAlign: "right", padding: "0.2rem 0.6rem", whiteSpace: "nowrap" };
const labelStyle: CSSProperties = { textAlign: "left", padding: "0.2rem 0.6rem", whiteSpace: "nowrap" };
const totalRowLabelStyle: CSSProperties = { ...labelStyle, fontWeight: 700, borderTop: "1px solid #999" };
const totalCellStyle: CSSProperties = { ...thStyle, fontWeight: 700, borderTop: "1px solid #999" };

function PeerBetaTable({
  peers,
  included,
  onToggle,
  hamada,
}: {
  peers: BetaPeer[];
  included: Record<string, boolean>;
  onToggle: (name: string) => void;
  hamada: HamadaFromPeersResult;
}) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={labelStyle}>Include</th>
          <th style={labelStyle}>Company</th>
          <th style={thStyle}>5Y equity beta</th>
          <th style={thStyle}>Equity value</th>
          <th style={thStyle}>Total debt</th>
          <th style={thStyle}>D/E</th>
          <th style={thStyle}>Marginal tax</th>
          <th style={thStyle}>Asset beta</th>
        </tr>
      </thead>
      <tbody>
        {peers.map((peer) => {
          const row = hamada.peers.find((r) => r.name === peer.name);
          return (
            <tr key={peer.name}>
              <td style={labelStyle}>
                <input
                  type="checkbox"
                  data-testid={`peer-include-${peer.name}`}
                  checked={included[peer.name] ?? true}
                  onChange={() => onToggle(peer.name)}
                />
              </td>
              <td style={labelStyle}>{peer.name}</td>
              <td style={thStyle}>{peer.equityBeta5Y.toFixed(2)}</td>
              <td style={thStyle}>{formatNumber(peer.equityValue)}</td>
              <td style={thStyle}>{formatNumber(peer.totalDebt)}</td>
              <td style={thStyle}>{row ? row.debtToEquity.toFixed(4) : "—"}</td>
              <td style={thStyle}>{formatPercent(peer.marginalTaxRate, 1)}</td>
              <td style={thStyle} data-testid={`peer-asset-beta-${peer.name}`}>
                {row ? row.assetBeta.toFixed(4) : "—"}
              </td>
            </tr>
          );
        })}
        <tr>
          <td style={totalRowLabelStyle} colSpan={7}>
            Average asset beta ({hamada.includedCount} peer{hamada.includedCount === 1 ? "" : "s"} included)
          </td>
          <td style={totalCellStyle} data-testid="average-asset-beta">
            {hamada.averageAssetBeta.toFixed(4)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function BetaWaccView() {
  const { state: companyState } = useCompany();
  const provider = useMarketDataProvider();
  const { assumptions } = useAssumptions();
  const [marketState, setMarketState] = useState<MarketState>({ status: "idle" });
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SIA_BETA_PEERS.map((peer) => [peer.name, !(peer.excluded ?? false)])),
  );

  useEffect(() => {
    if (companyState.status !== "ready") {
      setMarketState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const company = companyState.company;
    setMarketState({ status: "loading" });
    Promise.all([provider.getFinancials(company), provider.getMarketData(company)])
      .then(([financials, market]) => {
        if (cancelled) return;
        setMarketState({ status: "ready", financials, market });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMarketState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [companyState, provider]);

  const toggle = (name: string) => {
    setIncluded((prev) => ({ ...prev, [name]: !(prev[name] ?? true) }));
  };

  const hamada = useMemo<HamadaFromPeersResult>(
    () =>
      hamadaBetaFromPeers(
        SIA_BETA_PEERS.map((peer) => ({
          name: peer.name,
          equityBeta5Y: peer.equityBeta5Y,
          totalDebt: peer.totalDebt,
          equityValue: peer.equityValue,
          marginalTaxRate: peer.marginalTaxRate,
          excluded: !(included[peer.name] ?? true),
        })),
        SIA_HAMADA_TARGET,
      ),
    [included],
  );

  if (companyState.status !== "ready") {
    return (
      <section>
        <h2>Beta/WACC</h2>
        <p>Select a company in Search to build cost of capital.</p>
      </section>
    );
  }

  if (marketState.status === "loading" || marketState.status === "idle") {
    return (
      <section>
        <h2>Beta/WACC</h2>
        <p>Loading market data…</p>
      </section>
    );
  }

  if (marketState.status === "error") {
    return (
      <section>
        <h2>Beta/WACC</h2>
        <p role="alert" style={{ color: "#b91c1c" }}>
          {marketState.message}
        </p>
      </section>
    );
  }

  const { financials, market } = marketState;
  const lastInterestExpense = Math.abs(
    financials.incomeStatement.interestExpense[financials.incomeStatement.interestExpense.length - 1] ?? 0,
  );
  const preTaxCostOfDebt = lastInterestExpense / market.marketValueOfDebt;
  const afterTaxKd = afterTaxCostOfDebt(preTaxCostOfDebt, assumptions.taxRate);
  const costOfEquity = costOfEquityCapm({
    riskFreeRate: assumptions.riskFreeRate,
    equityBeta: hamada.releveredEquityBeta,
    equityRiskPremium: assumptions.marketRiskPremium,
  });
  const marketValueOfEquity = market.currentPrice * market.sharesOutstanding;
  const marketValueOfDebt = market.marketValueOfDebt;
  const totalCapital = marketValueOfEquity + marketValueOfDebt;
  const weightOfEquity = marketValueOfEquity / totalCapital;
  const weightOfDebt = marketValueOfDebt / totalCapital;
  const wacc = weightOfEquity * costOfEquity + weightOfDebt * afterTaxKd;

  return (
    <section>
      <h2>Beta/WACC</h2>
      <p>Peer beta build and cost-of-capital derivation for {companyState.company.name}.</p>

      <h3>Peer beta table</h3>
      <PeerBetaTable peers={SIA_BETA_PEERS} included={included} onToggle={toggle} hamada={hamada} />

      <h3>SIA relever</h3>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={labelStyle}>Target D/E</td>
            <td style={thStyle}>{SIA_HAMADA_TARGET.debtToEquity.toFixed(4)}</td>
            <td style={labelStyle}>Target marginal tax</td>
            <td style={thStyle}>{formatPercent(SIA_HAMADA_TARGET.taxRate, 0)}</td>
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>Average asset beta</td>
            <td style={totalCellStyle} data-testid="relever-average-asset-beta">
              {hamada.averageAssetBeta.toFixed(4)}
            </td>
            <td style={totalRowLabelStyle}>Relevered equity beta</td>
            <td style={totalCellStyle} data-testid="relevered-equity-beta">
              {hamada.releveredEquityBeta.toFixed(4)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>WACC build</h3>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={labelStyle}>Risk-free rate (Rf)</td>
            <td style={thStyle} data-testid="wacc-rf">{formatPercent(assumptions.riskFreeRate)}</td>
            <td style={labelStyle}>Market risk premium (MRP)</td>
            <td style={thStyle} data-testid="wacc-mrp">{formatPercent(assumptions.marketRiskPremium)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Cost of equity (Ke)</td>
            <td style={thStyle} data-testid="wacc-ke">{formatPercent(costOfEquity)}</td>
            <td style={labelStyle}>Pre-tax cost of debt (Kd)</td>
            <td style={thStyle} data-testid="wacc-kd-pretax">{formatPercent(preTaxCostOfDebt)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>After-tax cost of debt</td>
            <td style={thStyle} data-testid="wacc-kd-aftertax">{formatPercent(afterTaxKd)}</td>
            <td style={labelStyle}>Marginal tax rate</td>
            <td style={thStyle}>{formatPercent(assumptions.taxRate, 0)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>MV equity (price × shares)</td>
            <td style={thStyle} data-testid="wacc-mv-equity">{formatNumber(marketValueOfEquity)}</td>
            <td style={labelStyle}>MV debt</td>
            <td style={thStyle} data-testid="wacc-mv-debt">{formatNumber(marketValueOfDebt)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Weight of equity</td>
            <td style={thStyle}>{formatPercent(weightOfEquity, 1)}</td>
            <td style={labelStyle}>Weight of debt</td>
            <td style={thStyle}>{formatPercent(weightOfDebt, 1)}</td>
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>WACC</td>
            <td style={totalCellStyle} data-testid="wacc-result" colSpan={3}>
              {formatPercent(wacc)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
