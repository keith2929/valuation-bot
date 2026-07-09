import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FinancialStatements, MarketData, PeerData } from "@valuation-bot/contract";
import {
  afterTaxCostOfDebt,
  applyCompsToTarget,
  buildComps,
  buildForecast,
  costOfEquityCapm,
  dcf,
  ddm,
  hamadaBetaFromPeers,
  type CompsImpliedValuation,
  type CompsResult,
  type DcfResult,
  type DcfValuation,
  type DdmResult,
  type ForecastResult,
  type HamadaFromPeersResult,
  type ImpliedValuationStatistics,
  type MultipleStatistics,
  type TargetFinancials,
} from "@valuation-bot/valuation-creator-core";
import { SIA_BETA_PEERS, SIA_COMPS_PEER_REFS, SIA_HAMADA_TARGET } from "@valuation-bot/valuation-creator";
import { useCompany } from "../company/CompanyContext";
import { useMarketDataProvider } from "../providers/ProviderContext";
import { useAssumptions } from "../assumptions/AssumptionsContext";
import { toCoreForecastAssumptions, toCoreScenario } from "../forecast/toCoreForecast";

type MarketState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; financials: FinancialStatements; market: MarketData };

type PeersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; peers: PeerData[] };

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Per-share figures are golden to 4dp (see fixtures/siaValuation.ts). */
function formatPrice(value: number): string {
  return value.toFixed(4);
}

function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: "0.85rem", marginBottom: "1rem" };
const thStyle: CSSProperties = { textAlign: "right", padding: "0.2rem 0.6rem", whiteSpace: "nowrap" };
const labelStyle: CSSProperties = { textAlign: "left", padding: "0.2rem 0.6rem", whiteSpace: "nowrap" };
const captionStyle: CSSProperties = { textAlign: "left", fontWeight: 600, padding: "0.2rem 0.6rem 0.4rem" };
const totalRowLabelStyle: CSSProperties = { ...labelStyle, fontWeight: 700, borderTop: "1px solid #999" };
const totalCellStyle: CSSProperties = { ...thStyle, fontWeight: 700, borderTop: "1px solid #999" };

// ---------------------------------------------------------------------------
// DCF panel
// ---------------------------------------------------------------------------

function FcffTable({ dcfResult }: { dcfResult: DcfResult }) {
  return (
    <table style={tableStyle}>
      <caption style={captionStyle}>Free cash flow to the firm (mid-year discounting)</caption>
      <thead>
        <tr>
          <th style={labelStyle} />
          {dcfResult.years.map((y) => (
            <th key={y.year} style={thStyle}>
              Year {y.year}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={labelStyle}>FCFF</td>
          {dcfResult.years.map((y) => (
            <td key={y.year} style={thStyle} data-testid={`dcf-fcff-${y.year}`}>
              {formatNumber(y.freeCashFlow)}
            </td>
          ))}
        </tr>
        <tr>
          <td style={labelStyle}>Discount period</td>
          {dcfResult.years.map((y) => (
            <td key={y.year} style={thStyle} data-testid={`dcf-discount-period-${y.year}`}>
              {y.discountPeriod.toFixed(1)}
            </td>
          ))}
        </tr>
        <tr>
          <td style={labelStyle}>Discount factor</td>
          {dcfResult.years.map((y) => (
            <td key={y.year} style={thStyle} data-testid={`dcf-discount-factor-${y.year}`}>
              {y.discountFactor.toFixed(4)}
            </td>
          ))}
        </tr>
        <tr>
          <td style={totalRowLabelStyle}>PV of FCFF</td>
          {dcfResult.years.map((y) => (
            <td key={y.year} style={totalCellStyle}>
              {formatNumber(y.presentValue)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function DcfValuationBlock({
  title,
  valuation,
  presentValueOfForecast,
  totalDebt,
  cash,
  sharesOutstanding,
  currentPrice,
  testPrefix,
}: {
  title: string;
  valuation: DcfValuation;
  presentValueOfForecast: number;
  totalDebt: number;
  cash: number;
  sharesOutstanding: number;
  currentPrice: number;
  testPrefix: string;
}) {
  const netDebt = totalDebt - cash;
  return (
    <table style={tableStyle}>
      <caption style={captionStyle}>{title}</caption>
      <tbody>
        <tr>
          <td style={labelStyle}>Terminal value</td>
          <td style={thStyle}>{formatNumber(valuation.terminal.terminalValue)}</td>
          <td style={labelStyle}>Discount factor</td>
          <td style={thStyle}>{valuation.terminal.discountFactor.toFixed(4)}</td>
        </tr>
        <tr>
          <td style={labelStyle}>PV of terminal value</td>
          <td style={thStyle} data-testid={`${testPrefix}-pv-terminal-value`}>
            {formatNumber(valuation.terminal.presentValueOfTerminalValue)}
          </td>
          <td style={labelStyle}>PV of explicit FCFF</td>
          <td style={thStyle}>{formatNumber(presentValueOfForecast)}</td>
        </tr>
        <tr>
          <td style={totalRowLabelStyle}>Enterprise value</td>
          <td style={totalCellStyle} colSpan={3} data-testid={`${testPrefix}-enterprise-value`}>
            {formatNumber(valuation.enterpriseValue)}
          </td>
        </tr>
        <tr>
          <td style={labelStyle}>Less: total debt</td>
          <td style={thStyle}>({formatNumber(totalDebt)})</td>
          <td style={labelStyle}>Plus: cash</td>
          <td style={thStyle}>{formatNumber(cash)}</td>
        </tr>
        <tr>
          <td style={labelStyle}>Net debt</td>
          <td style={thStyle}>{formatNumber(netDebt)}</td>
          <td style={labelStyle}>Shares outstanding</td>
          <td style={thStyle}>{formatNumber(sharesOutstanding)}</td>
        </tr>
        <tr>
          <td style={totalRowLabelStyle}>Equity value</td>
          <td style={totalCellStyle} data-testid={`${testPrefix}-equity-value`}>
            {formatNumber(valuation.equityValue)}
          </td>
          <td style={totalRowLabelStyle}>Value per share</td>
          <td style={totalCellStyle} data-testid={`${testPrefix}-price`}>
            {formatPrice(valuation.equityValuePerShare)}
          </td>
        </tr>
        <tr>
          <td style={labelStyle}>Current price</td>
          <td style={thStyle}>{formatPrice(currentPrice)}</td>
          <td style={totalRowLabelStyle}>Upside / (downside)</td>
          <td style={totalCellStyle} data-testid={`${testPrefix}-upside`}>
            {formatPercent(valuation.upside, 1)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// DDM panel
// ---------------------------------------------------------------------------

function DdmTable({
  ddmResult,
  sharesOutstanding,
  currentPrice,
}: {
  ddmResult: DdmResult;
  sharesOutstanding: number;
  currentPrice: number;
}) {
  return (
    <>
      <table style={tableStyle}>
        <caption style={captionStyle}>Dividend build (common / special split, mid-year discounting)</caption>
        <thead>
          <tr>
            <th style={labelStyle} />
            {ddmResult.years.map((y) => (
              <th key={y.year} style={thStyle}>
                Year {y.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={labelStyle}>Net income</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={thStyle}>
                {formatNumber(y.netIncome)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelStyle}>Common dividends</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={thStyle} data-testid={`ddm-common-${y.year}`}>
                {formatNumber(y.commonDividends)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelStyle}>Special dividends</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={thStyle} data-testid={`ddm-special-${y.year}`}>
                {formatNumber(y.specialDividends)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>Total dividends</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={totalCellStyle}>
                {formatNumber(y.totalDividends)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelStyle}>Discount period</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={thStyle}>
                {y.discountPeriod.toFixed(1)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={labelStyle}>Discount factor</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={thStyle}>
                {y.discountFactor.toFixed(4)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>PV of dividends</td>
            {ddmResult.years.map((y) => (
              <td key={y.year} style={totalCellStyle}>
                {formatNumber(y.presentValue)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={labelStyle}>Payout ratio (avg of last 2 FYs)</td>
            <td style={thStyle}>{formatPercent(ddmResult.payout.averagePayoutRatio, 2)}</td>
            <td style={labelStyle}>PV of dividends</td>
            <td style={thStyle}>{formatNumber(ddmResult.presentValueOfDividends)}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Terminal value</td>
            <td style={thStyle}>{formatNumber(ddmResult.terminal.terminalValue)}</td>
            <td style={labelStyle}>PV of terminal value</td>
            <td style={thStyle} data-testid="ddm-pv-terminal-value">
              {formatNumber(ddmResult.terminal.presentValueOfTerminalValue)}
            </td>
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>Equity value</td>
            <td style={totalCellStyle} data-testid="ddm-equity-value">
              {formatNumber(ddmResult.equityValue)}
            </td>
            <td style={totalRowLabelStyle}>Shares outstanding</td>
            <td style={totalCellStyle}>{formatNumber(sharesOutstanding)}</td>
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>Implied price</td>
            <td style={totalCellStyle} data-testid="ddm-price">
              {formatPrice(ddmResult.impliedPrice)}
            </td>
            <td style={labelStyle}>Current price</td>
            <td style={thStyle}>{formatPrice(currentPrice)}</td>
          </tr>
          <tr>
            <td style={totalRowLabelStyle}>Upside / (downside)</td>
            <td style={totalCellStyle} data-testid="ddm-upside" colSpan={3}>
              {formatPercent(ddmResult.impliedPrice / currentPrice - 1, 1)}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Comps panel
// ---------------------------------------------------------------------------

function PeerMultiplesTable({ comps }: { comps: CompsResult }) {
  return (
    <table style={tableStyle}>
      <caption style={captionStyle}>Peer trading multiples</caption>
      <thead>
        <tr>
          <th style={labelStyle}>Peer</th>
          <th style={thStyle}>Price</th>
          <th style={thStyle}>Market cap</th>
          <th style={thStyle}>EV</th>
          <th style={thStyle}>P/E LTM</th>
          <th style={thStyle}>P/B LTM</th>
          <th style={thStyle}>EV/EBITDA LTM</th>
          <th style={thStyle}>P/E NTM</th>
          <th style={thStyle}>EV/EBITDA NTM</th>
        </tr>
      </thead>
      <tbody>
        {comps.peers.map((p) => (
          <tr key={p.name}>
            <td style={labelStyle}>{p.name}</td>
            <td style={thStyle}>{formatPrice(p.priceSGD)}</td>
            <td style={thStyle}>{formatNumber(p.marketCap)}</td>
            <td style={thStyle}>{formatNumber(p.ev)}</td>
            <td style={thStyle}>{formatMultiple(p.peLtm)}</td>
            <td style={thStyle}>{formatMultiple(p.pbLtm)}</td>
            <td style={thStyle}>{formatMultiple(p.evEbitdaLtm)}</td>
            <td style={thStyle}>{formatMultiple(p.peNtm)}</td>
            <td style={thStyle}>{formatMultiple(p.evEbitdaNtm)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STAT_ROWS: { key: keyof MultipleStatistics; label: string }[] = [
  { key: "average", label: "Average" },
  { key: "minimum", label: "Minimum" },
  { key: "p25", label: "25th percentile" },
  { key: "median", label: "Median" },
  { key: "p75", label: "75th percentile" },
  { key: "maximum", label: "Maximum" },
];

function MultipleStatTable({
  label,
  stats,
  implied,
}: {
  label: string;
  stats: MultipleStatistics;
  implied: ImpliedValuationStatistics;
}) {
  const testKey = slug(label);
  return (
    <table style={tableStyle}>
      <caption style={captionStyle}>{label}</caption>
      <thead>
        <tr>
          <th style={labelStyle} />
          <th style={thStyle}>Multiple</th>
          <th style={thStyle}>Implied price</th>
          <th style={thStyle}>Upside</th>
        </tr>
      </thead>
      <tbody>
        {STAT_ROWS.map(({ key, label: rowLabel }) => {
          const iv = implied[key];
          const isMedian = key === "median";
          return (
            <tr key={key}>
              <td style={isMedian ? totalRowLabelStyle : labelStyle}>{rowLabel}</td>
              <td
                style={isMedian ? totalCellStyle : thStyle}
                data-testid={`comps-${testKey}-${key}-multiple`}
              >
                {formatMultiple(stats[key])}
              </td>
              <td style={isMedian ? totalCellStyle : thStyle} data-testid={`comps-${testKey}-${key}-price`}>
                {formatPrice(iv.impliedPrice)}
              </td>
              <td style={isMedian ? totalCellStyle : thStyle} data-testid={`comps-${testKey}-${key}-upside`}>
                {formatPercent(iv.upside, 1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ValuationsView() {
  const { state: companyState } = useCompany();
  const provider = useMarketDataProvider();
  const { assumptions } = useAssumptions();
  const [marketState, setMarketState] = useState<MarketState>({ status: "idle" });
  const [peersState, setPeersState] = useState<PeersState>({ status: "idle" });

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

  useEffect(() => {
    if (companyState.status !== "ready") {
      setPeersState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setPeersState({ status: "loading" });
    Promise.all(SIA_COMPS_PEER_REFS.map((ref) => provider.getPeer(ref.ticker, ref.exchange)))
      .then((peers) => {
        if (cancelled) return;
        setPeersState({ status: "ready", peers });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPeersState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [companyState, provider]);

  const forecast = useMemo<ForecastResult | null>(() => {
    if (marketState.status !== "ready") return null;
    try {
      return buildForecast(
        marketState.financials,
        toCoreForecastAssumptions(assumptions),
        toCoreScenario(assumptions.scenario),
      );
    } catch {
      return null;
    }
  }, [marketState, assumptions]);

  // Beta build uses SIA_BETA_PEERS' default outlier exclusion (Qantas) --
  // the Beta/WACC view lets a user retoggle this; the Valuations panel always
  // reflects that view's default, matching the documented golden chain.
  const hamada = useMemo<HamadaFromPeersResult>(
    () => hamadaBetaFromPeers(SIA_BETA_PEERS, SIA_HAMADA_TARGET),
    [],
  );

  const capm = useMemo(() => {
    if (marketState.status !== "ready") return null;
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
    const totalCapital = marketValueOfEquity + market.marketValueOfDebt;
    const wacc =
      (marketValueOfEquity / totalCapital) * costOfEquity + (market.marketValueOfDebt / totalCapital) * afterTaxKd;
    return { costOfEquity, afterTaxKd, wacc };
  }, [marketState, assumptions, hamada]);

  const dcfResult = useMemo<DcfResult | null>(() => {
    if (marketState.status !== "ready" || !forecast || !capm) return null;
    const { market } = marketState;
    return dcf({
      netDebt: market.marketValueOfDebt - market.cash,
      sharesOutstanding: market.sharesOutstanding,
      freeCashFlows: forecast.drivers.freeCashFlows,
      discountRate: capm.wacc,
      terminalGrowthRate: assumptions.dcfTerminalGrowth,
      exitMultiple: assumptions.exitMultiple,
      terminalMetric: forecast.drivers.terminalEBITDA,
      currentPrice: market.currentPrice,
    });
  }, [marketState, forecast, capm, assumptions]);

  const ddmResult = useMemo<DdmResult | null>(() => {
    if (marketState.status !== "ready" || !forecast || !capm) return null;
    const { financials, market } = marketState;
    const is = financials.incomeStatement;
    const cf = financials.cashFlow;
    const history = financials.fiscalYears.map((fy, i) => ({
      name: `FY${fy}`,
      totalDividendsPaid: Math.abs(cf.commonDividendsPaid[i] ?? 0),
      netIncome: is.netIncome[i] ?? 0,
    }));
    return ddm({
      history,
      forecastNetIncome: forecast.netIncome.years.map((y) => y.netIncome),
      sharesOutstanding: market.sharesOutstanding,
      specialDividendsPerShare: assumptions.specialDPS,
      costOfEquity: capm.costOfEquity,
      terminalGrowthRate: assumptions.ddmTerminalGrowth,
    });
  }, [marketState, forecast, capm, assumptions]);

  const comps = useMemo<CompsResult | null>(() => {
    if (peersState.status !== "ready") return null;
    return buildComps(peersState.peers);
  }, [peersState]);

  const compsImplied = useMemo<CompsImpliedValuation | null>(() => {
    if (!comps || marketState.status !== "ready" || !forecast) return null;
    const { financials, market } = marketState;
    const is = financials.incomeStatement;
    const bs = financials.balanceSheet;
    const target: TargetFinancials = {
      currentPrice: market.currentPrice,
      sharesOutstanding: market.sharesOutstanding,
      ltmEarnings: is.netIncome[is.netIncome.length - 1]!,
      ltmBookValueOfEquity: bs.bookValueOfEquity[bs.bookValueOfEquity.length - 1]!,
      // LTM EBITDA = LTM EBIT + LTM D&A (FinancialStatements does not carry a
      // separate reported EBITDA line).
      ltmEbitda: is.ebit[is.ebit.length - 1]! + is.dandA[is.dandA.length - 1]!,
      ltmDebt: market.marketValueOfDebt,
      ltmCash: market.cash,
      ntmEarnings: forecast.ntm.ntmEarnings,
      ntmEbitda: forecast.ntm.ntmEbitda,
      ntmDebt: forecast.ntm.ntmDebt,
      ntmCash: forecast.ntm.ntmCash,
    };
    return applyCompsToTarget(comps, target);
  }, [comps, marketState, forecast]);

  if (companyState.status !== "ready") {
    return (
      <section>
        <h2>Valuations</h2>
        <p>Select a company in Search to run valuations.</p>
      </section>
    );
  }

  if (marketState.status === "loading" || marketState.status === "idle") {
    return (
      <section>
        <h2>Valuations</h2>
        <p>Loading market data…</p>
      </section>
    );
  }

  if (marketState.status === "error") {
    return (
      <section>
        <h2>Valuations</h2>
        <p role="alert" style={{ color: "#b91c1c" }}>
          {marketState.message}
        </p>
      </section>
    );
  }

  const { market } = marketState;

  return (
    <section>
      <h2>Valuations</h2>
      <p>
        DCF, DDM, and trading comps for {companyState.company.name} ({assumptions.scenario} case).
      </p>

      {!forecast && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          Forecast unavailable for the current assumptions; DCF/DDM cannot be computed.
        </p>
      )}

      <h3>DCF</h3>
      {dcfResult ? (
        <>
          <FcffTable dcfResult={dcfResult} />
          <DcfValuationBlock
            title="Gordon Growth terminal value"
            valuation={dcfResult.gordonGrowth}
            presentValueOfForecast={dcfResult.presentValueOfForecast}
            totalDebt={market.marketValueOfDebt}
            cash={market.cash}
            sharesOutstanding={market.sharesOutstanding}
            currentPrice={market.currentPrice}
            testPrefix="dcf-gordon"
          />
          <DcfValuationBlock
            title="Exit multiple terminal value"
            valuation={dcfResult.exitMultiple}
            presentValueOfForecast={dcfResult.presentValueOfForecast}
            totalDebt={market.marketValueOfDebt}
            cash={market.cash}
            sharesOutstanding={market.sharesOutstanding}
            currentPrice={market.currentPrice}
            testPrefix="dcf-exit"
          />
        </>
      ) : (
        <p>DCF unavailable.</p>
      )}

      <h3>DDM</h3>
      {ddmResult ? (
        <DdmTable ddmResult={ddmResult} sharesOutstanding={market.sharesOutstanding} currentPrice={market.currentPrice} />
      ) : (
        <p>DDM unavailable.</p>
      )}

      <h3>Trading comps</h3>
      {peersState.status === "loading" || peersState.status === "idle" ? (
        <p>Loading peer data…</p>
      ) : peersState.status === "error" ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {peersState.message}
        </p>
      ) : comps && compsImplied ? (
        <>
          <PeerMultiplesTable comps={comps} />
          <MultipleStatTable label="P/E LTM" stats={comps.peLtm} implied={compsImplied.peLtm} />
          <MultipleStatTable label="P/B LTM" stats={comps.pbLtm} implied={compsImplied.pbLtm} />
          <MultipleStatTable label="EV/EBITDA LTM" stats={comps.evEbitdaLtm} implied={compsImplied.evEbitdaLtm} />
          <MultipleStatTable label="P/E NTM" stats={comps.peNtm} implied={compsImplied.peNtm} />
          <MultipleStatTable label="EV/EBITDA NTM" stats={comps.evEbitdaNtm} implied={compsImplied.evEbitdaNtm} />
        </>
      ) : (
        <p>Comps unavailable.</p>
      )}
    </section>
  );
}
