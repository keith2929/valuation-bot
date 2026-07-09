import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FinancialStatements } from "@valuation-bot/contract";
import { buildForecast, type ForecastResult } from "@valuation-bot/valuation-creator-core";
import { useCompany } from "../company/CompanyContext";
import { useMarketDataProvider } from "../providers/ProviderContext";
import { useAssumptions } from "../assumptions/AssumptionsContext";
import { toCoreForecastAssumptions, toCoreScenario } from "../forecast/toCoreForecast";
import type { WarningsCapableProvider } from "../providers/CachedMarketDataProvider";

type FinancialsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; financials: FinancialStatements; warnings: string[] };

/** Tolerance for the "Balanced?" identity check, in the statement's currency units. */
const BALANCE_TOLERANCE = 0.05;

function hasGetWarnings(provider: unknown): provider is WarningsCapableProvider {
  return typeof (provider as Partial<WarningsCapableProvider>).getWarnings === "function";
}

/** `[...hist, ...forecast]`, one 10-year (5 historical + 5 forecast) row of values. */
function merge(hist: readonly number[], forecastValues: readonly number[]): number[] {
  return [...hist, ...forecastValues];
}

function dash(count: number): null[] {
  return new Array(count).fill(null);
}

type CellValue = number | string | null;

interface StatementRow {
  label: string;
  values: CellValue[];
  kind?: "subtotal";
  format?: "percent" | "text";
}

function formatCell(value: CellValue, format?: "percent" | "text"): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" };
const thStyle: CSSProperties = { textAlign: "right", padding: "0.2rem 0.5rem", whiteSpace: "nowrap" };
const rowLabelStyle: CSSProperties = { textAlign: "left", padding: "0.2rem 0.5rem", whiteSpace: "nowrap" };
const subtotalRowLabelStyle: CSSProperties = { ...rowLabelStyle, fontWeight: 700, borderTop: "1px solid #999" };
const subtotalCellStyle: CSSProperties = { ...thStyle, fontWeight: 700, borderTop: "1px solid #999" };

/** Slugifies a row label into a stable `data-testid` suffix, e.g. "Total Revenue" -> "total-revenue". */
function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StatementTable({ years, forecastStartIndex, rows }: { years: string[]; forecastStartIndex: number; rows: StatementRow[] }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={rowLabelStyle} />
          {years.map((year, i) => (
            <th key={year} style={{ ...thStyle, borderLeft: i === forecastStartIndex ? "2px solid #999" : undefined }}>
              {year}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={row.kind === "subtotal" ? subtotalRowLabelStyle : rowLabelStyle}>{row.label}</td>
            {row.values.map((value, i) => (
              <td
                key={i}
                data-testid={`row-${slug(row.label)}-${i}`}
                style={{
                  ...(row.kind === "subtotal" ? subtotalCellStyle : thStyle),
                  borderLeft: i === forecastStartIndex ? "2px solid #999" : undefined,
                }}
              >
                {formatCell(value, row.format)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildIncomeStatementRows(financials: FinancialStatements, forecast: ForecastResult | null): StatementRow[] {
  const is = financials.incomeStatement;
  const fcYears = forecast?.incomeStatement.years ?? [];
  const fcNetIncome = forecast?.netIncome.years ?? [];

  const revenue = merge(is.revenue, fcYears.map((y) => y.revenue));
  const cogs = merge(is.cogs, fcYears.map((y) => y.cogs));
  const sga = merge(is.sga, fcYears.map((y) => y.sga));
  const dandA = merge(is.dandA, fcYears.map((y) => y.depreciationAndAmortisation));
  const otherOpEx = merge(is.otherOpEx, fcYears.map((y) => y.otherOpEx));
  const ebit = merge(is.ebit, fcYears.map((y) => y.ebit));
  // Historical interest expense/income and forecast are stored with opposite
  // sign conventions (historical: negative = expense; forecast: reported as a
  // positive expense) -- normalise forecast interest expense to the
  // historical (negative-outflow) display convention.
  const interestExpense = merge(is.interestExpense, fcNetIncome.map((y) => -y.interestExpense));
  const interestIncome = merge(is.interestIncome, fcNetIncome.map((y) => y.interestIncome));
  const incomeTaxExpense = merge(is.incomeTaxExpense, fcNetIncome.map((y) => y.incomeTaxExpense));
  const minorityInterest = merge(is.minorityInterest, fcNetIncome.map((y) => y.minorityInterest));
  const netIncome = merge(is.netIncome, fcNetIncome.map((y) => y.netIncome));

  const grossProfit = revenue.map((r, i) => r - cogs[i]!);
  const ebitda = merge(
    is.ebit.map((v, i) => v + is.dandA[i]!),
    fcYears.map((y) => y.ebitda),
  );
  // EBT convention matches core's own netIncome = ebt - incomeTaxExpense -
  // minorityInterest, applied consistently to historicals and forecast.
  const ebt = netIncome.map((ni, i) => ni + incomeTaxExpense[i]! + minorityInterest[i]!);

  const revenueGrowth = revenue.map((r, i) => (i === 0 ? null : r / revenue[i - 1]! - 1));
  const grossMargin = grossProfit.map((g, i) => g / revenue[i]!);
  const operatingMargin = ebit.map((e, i) => e / revenue[i]!);
  const ebitdaMargin = ebitda.map((e, i) => e / revenue[i]!);
  const netMargin = netIncome.map((n, i) => n / revenue[i]!);

  return [
    { label: "Total Revenue", values: revenue, kind: "subtotal" },
    { label: "Revenue growth %", values: revenueGrowth, format: "percent" },
    { label: "COGS", values: cogs },
    { label: "Gross Profit", values: grossProfit, kind: "subtotal" },
    { label: "Gross margin %", values: grossMargin, format: "percent" },
    { label: "SG&A", values: sga },
    { label: "D&A", values: dandA },
    { label: "Other operating expense", values: otherOpEx },
    { label: "Operating Income (EBIT)", values: ebit, kind: "subtotal" },
    { label: "Operating margin %", values: operatingMargin, format: "percent" },
    { label: "EBITDA", values: ebitda, kind: "subtotal" },
    { label: "EBITDA margin %", values: ebitdaMargin, format: "percent" },
    { label: "Interest expense", values: interestExpense },
    { label: "Interest income", values: interestIncome },
    { label: "EBT", values: ebt, kind: "subtotal" },
    { label: "Income tax expense", values: incomeTaxExpense },
    { label: "Minority interest", values: minorityInterest },
    { label: "Net Income", values: netIncome, kind: "subtotal" },
    { label: "Net margin %", values: netMargin, format: "percent" },
  ];
}

function buildBalanceSheetRows(financials: FinancialStatements, forecast: ForecastResult | null): StatementRow[] {
  const bs = financials.balanceSheet;
  const n = financials.fiscalYears.length;
  const fcYears = forecast?.balanceSheetCashFlow.years ?? [];

  const cash = merge(bs.cash, fcYears.map((y) => y.cash));
  const shortTermInvestments = merge(bs.shortTermInvestments, fcYears.map((y) => y.shortTermInvestments));
  const tradingAssetSecuritiesValues: CellValue[] = [...dash(n), ...fcYears.map((y) => y.tradingAssetSecurities)];
  const tradingAssetSecuritiesNumeric = tradingAssetSecuritiesValues.map((v) => (typeof v === "number" ? v : 0));
  const receivables = merge(bs.receivables, fcYears.map((y) => y.receivables));
  const inventory = merge(bs.inventory, fcYears.map((y) => y.inventory));
  const prepaid = merge(bs.prepaid, fcYears.map((y) => y.prepaid));
  const otherCurrentAssets = merge(bs.otherCurrentAssets, fcYears.map((y) => y.otherCurrentAssets));
  const totalCurrentAssets = cash.map(
    (v, i) =>
      v +
      shortTermInvestments[i]! +
      tradingAssetSecuritiesNumeric[i]! +
      receivables[i]! +
      inventory[i]! +
      prepaid[i]! +
      otherCurrentAssets[i]!,
  );

  const netPPE = merge(bs.netPPE, fcYears.map((y) => y.netPPE));
  const longTermInvestments = merge(bs.longTermInvestments, fcYears.map((y) => y.longTermInvestments));
  const goodwill = merge(bs.goodwill, fcYears.map((y) => y.goodwill));
  const intangibles = merge(bs.intangibles, fcYears.map((y) => y.intangibles));
  const otherLTAssets = merge(bs.otherLTAssets, fcYears.map((y) => y.otherLTAssets));
  const totalAssets = merge(bs.totalAssets, fcYears.map((y) => y.totalAssets));

  const accountsPayable = merge(bs.accountsPayable, fcYears.map((y) => y.accountsPayable));
  const accrued = merge(bs.accrued, fcYears.map((y) => y.accrued));
  const currentPortionLTDebt = merge(bs.currentPortionLTDebt, fcYears.map((y) => y.currentPortionLTDebt));
  const currentLeases = merge(bs.currentLeases, fcYears.map((y) => y.currentLeases));
  const taxesPayable = merge(bs.taxesPayable, fcYears.map((y) => y.taxesPayable));
  const unearnedRevenue = merge(bs.unearnedRevCurrent, fcYears.map((y) => y.unearnedRevenue));
  const otherCurrentLiabilities = merge(bs.otherCurrentLiabilities, fcYears.map((y) => y.otherCurrentLiabilities));
  const totalCurrentLiabilities = accountsPayable.map(
    (v, i) =>
      v +
      accrued[i]! +
      currentPortionLTDebt[i]! +
      currentLeases[i]! +
      taxesPayable[i]! +
      unearnedRevenue[i]! +
      otherCurrentLiabilities[i]!,
  );

  const longTermDebt = merge(bs.longTermDebt, fcYears.map((y) => y.longTermDebt));
  const longTermLeases = merge(bs.longTermLeases, fcYears.map((y) => y.longTermLeases));
  const pensionOPEB = merge(bs.pensionOPEB, fcYears.map((y) => y.pensionOPEB));
  const deferredTaxLiability = merge(bs.deferredTaxLiability, fcYears.map((y) => y.deferredTaxLiability));
  const otherNonCurrentLiabilities = merge(bs.otherNonCurrentLiabilities, fcYears.map((y) => y.otherNonCurrentLiabilities));
  const totalLiabilities = merge(bs.totalLiabilities, fcYears.map((y) => y.totalLiabilities));

  const commonEquity = merge(bs.commonEquity, fcYears.map((y) => y.commonEquity));
  const retainedEarnings = merge(bs.retainedEarnings, fcYears.map((y) => y.retainedEarnings));
  const minorityInterest = merge(bs.minorityInterest, fcYears.map((y) => y.minorityInterest));
  const totalEquity = merge(bs.totalEquity, fcYears.map((y) => y.totalEquity));

  const totalLiabilitiesAndEquity = totalLiabilities.map((v, i) => v + totalEquity[i]!);
  const balanced: CellValue[] = totalAssets.map((assets, i) => {
    const diff = assets - totalLiabilitiesAndEquity[i]!;
    return Math.abs(diff) <= BALANCE_TOLERANCE ? "Balanced" : `Off by ${diff.toFixed(1)}`;
  });

  return [
    { label: "Cash and equivalents", values: cash },
    { label: "Short-term investments", values: shortTermInvestments },
    { label: "Trading asset securities", values: tradingAssetSecuritiesValues },
    { label: "Receivables", values: receivables },
    { label: "Inventory", values: inventory },
    { label: "Prepaid expenses", values: prepaid },
    { label: "Other current assets", values: otherCurrentAssets },
    { label: "Total Current Assets", values: totalCurrentAssets, kind: "subtotal" },
    { label: "Net PP&E", values: netPPE },
    { label: "Long-term investments", values: longTermInvestments },
    { label: "Goodwill", values: goodwill },
    { label: "Intangibles", values: intangibles },
    { label: "Other long-term assets", values: otherLTAssets },
    { label: "Total Assets", values: totalAssets, kind: "subtotal" },
    { label: "Accounts payable", values: accountsPayable },
    { label: "Accrued liabilities", values: accrued },
    { label: "Current portion LT debt", values: currentPortionLTDebt },
    { label: "Current leases", values: currentLeases },
    { label: "Taxes payable", values: taxesPayable },
    { label: "Unearned revenue", values: unearnedRevenue },
    { label: "Other current liabilities", values: otherCurrentLiabilities },
    { label: "Total Current Liabilities", values: totalCurrentLiabilities, kind: "subtotal" },
    { label: "Long-term debt", values: longTermDebt },
    { label: "Long-term leases", values: longTermLeases },
    { label: "Pension / OPEB", values: pensionOPEB },
    { label: "Deferred tax liability", values: deferredTaxLiability },
    { label: "Other non-current liabilities", values: otherNonCurrentLiabilities },
    { label: "Total Liabilities", values: totalLiabilities, kind: "subtotal" },
    { label: "Common equity", values: commonEquity },
    { label: "Retained earnings", values: retainedEarnings },
    { label: "Minority interest", values: minorityInterest },
    { label: "Total Equity", values: totalEquity, kind: "subtotal" },
    { label: "Total Liabilities And Equity", values: totalLiabilitiesAndEquity, kind: "subtotal" },
    { label: "Balanced?", values: balanced, format: "text" },
  ];
}

function buildCashFlowRows(financials: FinancialStatements, forecast: ForecastResult | null): StatementRow[] {
  const is = financials.incomeStatement;
  const bs = financials.balanceSheet;
  const cf = financials.cashFlow;
  const n = financials.fiscalYears.length;
  const fcBsCf = forecast?.balanceSheetCashFlow.years ?? [];
  const fcPpe = forecast?.ppe.years ?? [];
  const fcNetIncome = forecast?.netIncome.years ?? [];

  const histChangeNWC = cf.dandA.map(
    (_v, i) =>
      cf.changeReceivables[i]! + cf.changeInventory[i]! + cf.changePayables[i]! + cf.changeUnearnedRev[i]! + cf.changeOtherNWC[i]!,
  );

  const dandA = merge(cf.dandA, fcPpe.map((y) => y.depreciationAndAmortisation));
  const changeNWC = merge(histChangeNWC, forecast?.workingCapital.years.map((y) => y.changeInNetWorkingCapital) ?? []);
  const cashFromOperations = merge(
    is.netIncome.map((ni, i) => ni + cf.dandA[i]! + histChangeNWC[i]!),
    fcBsCf.map((y) => y.cashFromOperations),
  );

  const capex = merge(cf.capex, fcPpe.map((y) => -y.capitalExpenditure));
  const cashFromInvesting = merge(cf.capex, fcBsCf.map((y) => y.cashFromInvesting));

  const dividendsPaid = merge(cf.commonDividendsPaid, fcNetIncome.map((y) => -y.dividends));
  const debtIssued: CellValue[] = [...dash(n), ...fcBsCf.map((y) => y.debtIssued)];
  const cashFromFinancing = merge(cf.commonDividendsPaid, fcBsCf.map((y) => y.cashFromFinancing));

  const netChangeInCash = cashFromOperations.map((v, i) => v + cashFromInvesting[i]! + cashFromFinancing[i]!);
  const beginningCash: CellValue[] = [
    null,
    ...bs.cash.slice(0, n - 1),
    ...fcBsCf.map((y) => y.beginningCash),
  ];
  const endingCash = merge(bs.cash, fcBsCf.map((y) => y.endingCash));

  return [
    { label: "D&A (add-back)", values: dandA },
    { label: "Change in net working capital", values: changeNWC },
    { label: "Cash from Operations", values: cashFromOperations, kind: "subtotal" },
    { label: "Capital expenditure", values: capex },
    { label: "Cash from Investing", values: cashFromInvesting, kind: "subtotal" },
    { label: "Dividends paid", values: dividendsPaid },
    { label: "Debt issued / (repaid)", values: debtIssued },
    { label: "Cash from Financing", values: cashFromFinancing, kind: "subtotal" },
    { label: "Net change in cash", values: netChangeInCash },
    { label: "Beginning cash", values: beginningCash },
    { label: "Ending cash", values: endingCash, kind: "subtotal" },
  ];
}

export function StatementsView() {
  const { state: companyState } = useCompany();
  const provider = useMarketDataProvider();
  const { assumptions } = useAssumptions();
  const [financialsState, setFinancialsState] = useState<FinancialsState>({ status: "idle" });

  useEffect(() => {
    if (companyState.status !== "ready") {
      setFinancialsState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const company = companyState.company;
    setFinancialsState({ status: "loading" });
    provider
      .getFinancials(company)
      .then((financials) => {
        if (cancelled) return;
        const warnings = hasGetWarnings(provider) ? provider.getWarnings(company) : [];
        setFinancialsState({ status: "ready", financials, warnings });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFinancialsState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [companyState, provider]);

  const forecast = useMemo<ForecastResult | null>(() => {
    if (financialsState.status !== "ready") return null;
    try {
      return buildForecast(
        financialsState.financials,
        toCoreForecastAssumptions(assumptions),
        toCoreScenario(assumptions.scenario),
      );
    } catch {
      return null;
    }
  }, [financialsState, assumptions]);

  if (companyState.status !== "ready") {
    return (
      <section>
        <h2>Statements</h2>
        <p>Select a company in Search to view financial statements.</p>
      </section>
    );
  }

  if (financialsState.status === "loading" || financialsState.status === "idle") {
    return (
      <section>
        <h2>Statements</h2>
        <p>Loading financial statements…</p>
      </section>
    );
  }

  if (financialsState.status === "error") {
    return (
      <section>
        <h2>Statements</h2>
        <p role="alert" style={{ color: "#b91c1c" }}>
          {financialsState.message}
        </p>
      </section>
    );
  }

  const { financials, warnings } = financialsState;
  const forecastStartIndex = financials.fiscalYears.length;
  const years = [
    ...financials.fiscalYears.map((y) => `FY${y}`),
    ...(forecast?.incomeStatement.years.map((_, i) => `FY${Number(financials.fiscalYears[financials.fiscalYears.length - 1]) + i + 1}`) ?? []),
  ];

  return (
    <section>
      <h2>Statements</h2>
      <p>
        Historical (FY{financials.fiscalYears[0]}–FY{financials.fiscalYears[financials.fiscalYears.length - 1]}) and forecast (
        {assumptions.scenario} case) financial statements for {companyState.company.name}.
      </p>

      {warnings.length > 0 && (
        <div
          data-testid="statements-warnings-banner"
          role="alert"
          style={{
            background: "#fef3c7",
            border: "1px solid #d97706",
            borderRadius: "0.25rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
          }}
        >
          <strong>{warnings.length} extraction/adapter warning{warnings.length === 1 ? "" : "s"}:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!forecast && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          Forecast unavailable for the current assumptions; showing historical statements only.
        </p>
      )}

      <h3>Income statement</h3>
      <StatementTable years={years} forecastStartIndex={forecastStartIndex} rows={buildIncomeStatementRows(financials, forecast)} />

      <h3>Balance sheet</h3>
      <StatementTable years={years} forecastStartIndex={forecastStartIndex} rows={buildBalanceSheetRows(financials, forecast)} />

      <h3>Cash flow</h3>
      <StatementTable years={years} forecastStartIndex={forecastStartIndex} rows={buildCashFlowRows(financials, forecast)} />
    </section>
  );
}
