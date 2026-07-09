import { useEffect, useMemo, useState } from "react";
import type { FinancialStatements, MarketData, PeerData } from "@valuation-bot/contract";
import {
  afterTaxCostOfDebt,
  applyCompsToTarget,
  buildComps,
  buildForecast,
  costOfEquityCapm,
  dcf,
  ddm,
  footballField,
  hamadaBetaFromPeers,
  sensitivityRange,
  waccVsEbitdaMarginGrid,
  waccVsExitMultipleGrid,
  waccVsTerminalGrowthGrid,
  ddmSensitivityGrid,
  type CompsImpliedValuation,
  type FootballFieldResult,
  type ForecastResult,
  type SensitivityGrid,
  type TargetFinancials,
} from "@valuation-bot/valuation-creator-core";
import { SIA_BETA_PEERS, SIA_COMPS_PEER_REFS, SIA_HAMADA_TARGET } from "@valuation-bot/valuation-creator";
import { useCompany } from "../company/CompanyContext";
import { useMarketDataProvider } from "../providers/ProviderContext";
import { useAssumptions } from "../assumptions/AssumptionsContext";
import { toCoreForecastAssumptions, toCoreScenario } from "../forecast/toCoreForecast";

/** The four sensitivity grids, each with the base implied price at its centre. */
export interface ValuationGrids {
  /** DCF Gordon Growth: WACC (rows) x terminal growth rate (columns). */
  dcfGordon: SensitivityGrid;
  /** DCF Exit Multiple: WACC (rows) x terminal EBITDA margin (columns). */
  dcfExitMargin: SensitivityGrid;
  /** DCF Exit Multiple: WACC (rows) x exit multiple (columns). */
  dcfExitMultiple: SensitivityGrid;
  /** DDM: cost of equity (rows) x terminal growth rate (columns). */
  ddm: SensitivityGrid;
}

/**
 * Base implied price per share for each grid — the value that must sit in the
 * grid's centre cell (`values[2][2]` for a 5x5 grid centred on the base
 * inputs). Sourced directly from `dcf()` / `ddm()` rather than re-read out of
 * the grid, so the "centre cell == base price" invariant is testable.
 */
export interface ValuationCentres {
  dcfGordon: number;
  dcfExitMargin: number;
  dcfExitMultiple: number;
  ddm: number;
}

export interface ValuationModel {
  companyName: string;
  marketData: MarketData;
  grids: ValuationGrids;
  centres: ValuationCentres;
  /** Football field (7 bars + reference prices); null until peer data loads. */
  football: FootballFieldResult | null;
  /** Populated when peer data fails to load; the grids are unaffected. */
  peersError: string | null;
}

export type ValuationModelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; model: ValuationModel };

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

const STEPS_EACH_SIDE = 2; // 5-point axes (centre + 2 either side), per SIA_SENSITIVITY_GRID_AXES.

/**
 * Builds the full sensitivity + football-field model for the selected company,
 * mirroring `ValuationsView`'s DCF/DDM/comps pipeline exactly (same WACC build,
 * same `dcf()`/`ddm()` inputs) so every headline number matches that view.
 *
 * The four grids are centred on the *live* base inputs (computed WACC, computed
 * cost of equity, terminal EBITDA margin, and the assumption-panel terminal
 * growth / exit multiple), with axis spacing taken from
 * `assumptions.sensitivityStepSizes` (editable in the Assumptions panel). That
 * centring is what guarantees each grid's centre cell equals its base implied
 * price.
 */
export function useValuationModel(): ValuationModelState {
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

  // Beta build uses SIA_BETA_PEERS' default outlier exclusion (Qantas), the
  // same default chain the Valuations view reflects.
  const capm = useMemo(() => {
    if (marketState.status !== "ready") return null;
    const { financials, market } = marketState;
    const hamada = hamadaBetaFromPeers(SIA_BETA_PEERS, SIA_HAMADA_TARGET);
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
    return { costOfEquity, wacc };
  }, [marketState, assumptions]);

  const model = useMemo<ValuationModel | null>(() => {
    if (marketState.status !== "ready" || !forecast || !capm || companyState.status !== "ready") return null;

    const { financials, market } = marketState;
    const netDebt = market.marketValueOfDebt - market.cash;
    const sharesOutstanding = market.sharesOutstanding;
    const freeCashFlows = forecast.drivers.freeCashFlows;
    const steps = assumptions.sensitivityStepSizes;

    // --- Base DCF / DDM (identical inputs to ValuationsView) -----------------
    const dcfResult = dcf({
      netDebt,
      sharesOutstanding,
      freeCashFlows,
      discountRate: capm.wacc,
      terminalGrowthRate: assumptions.dcfTerminalGrowth,
      exitMultiple: assumptions.exitMultiple,
      terminalMetric: forecast.drivers.terminalEBITDA,
      currentPrice: market.currentPrice,
    });

    const is = financials.incomeStatement;
    const cf = financials.cashFlow;
    const ddmResult = ddm({
      history: financials.fiscalYears.map((fy, i) => ({
        name: `FY${fy}`,
        totalDividendsPaid: Math.abs(cf.commonDividendsPaid[i] ?? 0),
        netIncome: is.netIncome[i] ?? 0,
      })),
      forecastNetIncome: forecast.netIncome.years.map((y) => y.netIncome),
      sharesOutstanding,
      specialDividendsPerShare: assumptions.specialDPS,
      costOfEquity: capm.costOfEquity,
      terminalGrowthRate: assumptions.ddmTerminalGrowth,
    });

    // --- Sensitivity grids, centred on the live base inputs ------------------
    const waccValues = sensitivityRange(capm.wacc, steps.wacc, STEPS_EACH_SIDE);
    const terminalRevenue = forecast.drivers.terminalEBITDA / forecast.drivers.terminalEBITDAMargin;

    const dcfGordon = waccVsTerminalGrowthGrid({
      netDebt,
      sharesOutstanding,
      freeCashFlows,
      waccValues,
      terminalGrowthValues: sensitivityRange(assumptions.dcfTerminalGrowth, steps.dcfTerminalGrowth, STEPS_EACH_SIDE),
    });

    const dcfExitMargin = waccVsEbitdaMarginGrid({
      netDebt,
      sharesOutstanding,
      freeCashFlows,
      waccValues,
      ebitdaMarginValues: sensitivityRange(
        forecast.drivers.terminalEBITDAMargin,
        steps.terminalEbitdaMargin,
        STEPS_EACH_SIDE,
      ),
      terminalRevenue,
      exitMultiple: assumptions.exitMultiple,
    });

    const dcfExitMultiple = waccVsExitMultipleGrid({
      netDebt,
      sharesOutstanding,
      freeCashFlows,
      waccValues,
      exitMultipleValues: sensitivityRange(assumptions.exitMultiple, steps.exitMultiple, STEPS_EACH_SIDE),
      terminalEbitda: forecast.drivers.terminalEBITDA,
    });

    const ddmGrid = ddmSensitivityGrid({
      totalDividends: ddmResult.years.map((y) => y.totalDividends),
      costOfEquityValues: sensitivityRange(capm.costOfEquity, steps.ddmCostOfEquity, STEPS_EACH_SIDE),
      terminalGrowthValues: sensitivityRange(assumptions.ddmTerminalGrowth, steps.ddmTerminalGrowth, STEPS_EACH_SIDE),
      sharesOutstanding,
    });

    // --- Football field (needs comps; null until peers load) -----------------
    let football: FootballFieldResult | null = null;
    let peersError: string | null = null;
    if (peersState.status === "error") {
      peersError = peersState.message;
    } else if (peersState.status === "ready") {
      try {
        const bs = financials.balanceSheet;
        const target: TargetFinancials = {
          currentPrice: market.currentPrice,
          sharesOutstanding,
          ltmEarnings: is.netIncome[is.netIncome.length - 1]!,
          ltmBookValueOfEquity: bs.bookValueOfEquity[bs.bookValueOfEquity.length - 1]!,
          ltmEbitda: is.ebit[is.ebit.length - 1]! + is.dandA[is.dandA.length - 1]!,
          ltmDebt: market.marketValueOfDebt,
          ltmCash: market.cash,
          ntmEarnings: forecast.ntm.ntmEarnings,
          ntmEbitda: forecast.ntm.ntmEbitda,
          ntmDebt: forecast.ntm.ntmDebt,
          ntmCash: forecast.ntm.ntmCash,
        };
        const comps: CompsImpliedValuation = applyCompsToTarget(buildComps(peersState.peers), target);
        football = footballField({
          dcfGordonGrowthGrid: dcfGordon,
          dcfExitMultipleGrid: dcfExitMultiple,
          ddmGrid,
          comps,
          // Headline target = base-case DCF Exit Multiple implied price (this
          // grid's centre cell). Bit-identical to dcfResult.exitMultiple here.
          targetPrice: dcfResult.exitMultiple.equityValuePerShare,
          marketData: market,
        });
      } catch (error) {
        peersError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      companyName: companyState.company.name,
      marketData: market,
      grids: { dcfGordon, dcfExitMargin, dcfExitMultiple, ddm: ddmGrid },
      centres: {
        dcfGordon: dcfResult.gordonGrowth.equityValuePerShare,
        dcfExitMargin: dcfResult.exitMultiple.equityValuePerShare,
        dcfExitMultiple: dcfResult.exitMultiple.equityValuePerShare,
        ddm: ddmResult.impliedPrice,
      },
      football,
      peersError,
    };
  }, [marketState, peersState, forecast, capm, assumptions, companyState]);

  if (companyState.status !== "ready") return { status: "idle" };
  if (marketState.status === "error") return { status: "error", message: marketState.message };
  if (marketState.status === "loading" || marketState.status === "idle") return { status: "loading" };
  if (!model) {
    return { status: "error", message: "Forecast unavailable for the current assumptions." };
  }
  return { status: "ready", model };
}
