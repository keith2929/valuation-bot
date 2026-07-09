import type {
  ExtractionResult,
  ExtractionLine,
  FinancialStatements,
} from "@valuation-bot/contract";

/**
 * Adapter (Bot 1 → Bot 2): stitch one or more {@link ExtractionResult}s into a
 * single multi-year {@link FinancialStatements} spanning every fiscal year the
 * reports cover, alongside the diagnostic `warnings` the UI surfaces.
 *
 * This implements Part 3 of the master prompt, steps (a)–(e):
 *
 *   (a) Stitch reports into a timeline of ≥5 fiscal years. Each report carries
 *       two columns — its current period and the comparative prior period — so
 *       an overlapping set of annual reports observes some years twice (e.g.
 *       FY2023 is the current column of the FY2023 report and the comparative
 *       column of the FY2024 report). Reports are sorted by `period_end`,
 *       expanded into per-year observations, and merged into one timeline keyed
 *       by fiscal year. Where two reports overlap on a year, the earlier
 *       report's current column is cross-checked against the later report's
 *       comparative column; on a mismatch the AUDITED figure is preferred and a
 *       warning is pushed (rather than silently ranking one over the other).
 *
 *   (b) Values already arrive in absolute units, so no scaling/sign conversion
 *       happens here. Instead `unit_multiplier` is asserted consistent across
 *       reports and every report's `currency` must equal the output currency;
 *       any violation is warned, never silently converted.
 *
 *   (c) Canonical extraction tags are mapped onto the Part 4 fields (including
 *       the composite fields — see the field table below). A field whose source
 *       tag(s) are entirely absent for a year defaults to 0 and is warned.
 *
 *   (d) Working-capital movements (`changeReceivables`, `changeInventory`,
 *       `changePayables`, `changeUnearnedRev`, `changeOtherNWC`) are derived as
 *       year-over-year differences of the mapped balance-sheet items — never
 *       read from the cash flow statement.
 *
 *   (e) Balance-sheet tie-outs are re-run on the assembled result and every
 *       failure, plus every input `extraction_warning`, is forwarded into
 *       `warnings`.
 *
 * The result is deterministic and independent of the order the reports are
 * supplied in: everything derives from the `period_end`-sorted timeline.
 */
export function toFinancialStatements(reports: ExtractionResult[]): {
  statements: FinancialStatements;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Sort by period_end (ISO YYYY-MM-DD sorts lexicographically = by date) so
  // that everything downstream is order-insensitive to the input array.
  const sorted = [...reports].sort((a, b) => cmp(a.period_end, b.period_end));

  // (b) Output currency is the reporting currency of the most recent report;
  // every other report must agree. unit_multiplier must be consistent too.
  const outputCurrency = sorted.length > 0 ? sorted[sorted.length - 1]!.currency : "";
  const baseMultiplier = sorted.length > 0 ? sorted[0]!.unit_multiplier : 1;
  for (const report of sorted) {
    if (report.unit_multiplier !== baseMultiplier) {
      warnings.push(
        `unit_multiplier mismatch: report ending ${report.period_end} uses ` +
          `${report.unit_multiplier} but the series is on ${baseMultiplier}; ` +
          `figures were NOT converted.`,
      );
    }
    if (report.currency !== outputCurrency) {
      warnings.push(
        `currency mismatch: report ending ${report.period_end} is in ` +
          `${report.currency} but the series currency is ${outputCurrency}; ` +
          `figures were NOT converted.`,
      );
    }
  }

  // (a) Explode every report into per-year observations (current + comparative).
  const observations: Observation[] = [];
  for (const report of sorted) {
    const current = toObservation(report, "current");
    if (current !== null) observations.push(current);
    const comparative = toObservation(report, "comparative");
    if (comparative !== null) observations.push(comparative);
  }

  // Group observations by fiscal year and order the fiscal years ascending.
  const byYear = new Map<string, Observation[]>();
  for (const obs of observations) {
    const bucket = byYear.get(obs.fiscalYear);
    if (bucket) bucket.push(obs);
    else byYear.set(obs.fiscalYear, [obs]);
  }
  const fiscalYears = [...byYear.keys()].sort(cmp);

  // (a) Merge each year's overlapping observations into one tag→value map,
  // cross-checking overlaps and warning on mismatch.
  const mergedByYear = new Map<string, Map<string, number>>();
  for (const year of fiscalYears) {
    mergedByYear.set(year, mergeYear(year, byYear.get(year)!, warnings));
  }

  // (c) Map canonical tags onto the Part 4 fields, one array per field. A field
  // with no source tag in a given year is set to 0 and remembered as unmapped.
  const unmappedYears = new Map<string, string[]>();
  const income = {} as FinancialStatements["incomeStatement"];
  const balance = {} as FinancialStatements["balanceSheet"];

  for (const spec of INCOME_SPECS) {
    income[spec.key] = fiscalYears.map((year) =>
      evalField(spec, mergedByYear.get(year)!, year, `incomeStatement.${spec.key}`, unmappedYears),
    );
  }
  for (const spec of BALANCE_SPECS) {
    balance[spec.key] = fiscalYears.map((year) =>
      evalField(spec, mergedByYear.get(year)!, year, `balanceSheet.${spec.key}`, unmappedYears),
    );
  }

  const cfDandA = fiscalYears.map((year) =>
    evalField(CF_DANDA, mergedByYear.get(year)!, year, "cashFlow.dandA", unmappedYears),
  );
  const cfCapex = fiscalYears.map((year) =>
    evalField(CF_CAPEX, mergedByYear.get(year)!, year, "cashFlow.capex", unmappedYears),
  );
  const cfDividends = fiscalYears.map((year) =>
    evalField(CF_DIVIDENDS, mergedByYear.get(year)!, year, "cashFlow.commonDividendsPaid", unmappedYears),
  );

  // (d) Working-capital deltas are year-over-year balance-sheet differences.
  // "Other NWC" is the residual of the remaining operating current items:
  // (prepaid + other current assets) − (accrued + taxes payable + other current
  // liabilities). The first year has no prior period, so its delta is 0.
  const otherNWC = fiscalYears.map(
    (_year, i) =>
      balance.prepaid[i]! +
      balance.otherCurrentAssets[i]! -
      (balance.accrued[i]! + balance.taxesPayable[i]! + balance.otherCurrentLiabilities[i]!),
  );

  const cashFlow: FinancialStatements["cashFlow"] = {
    dandA: cfDandA,
    capex: cfCapex,
    commonDividendsPaid: cfDividends,
    changeReceivables: yoy(balance.receivables),
    changeInventory: yoy(balance.inventory),
    changePayables: yoy(balance.accountsPayable),
    changeUnearnedRev: yoy(balance.unearnedRevCurrent),
    changeOtherNWC: yoy(otherNWC),
  };

  const statements: FinancialStatements = {
    fiscalYears,
    currency: outputCurrency,
    incomeStatement: income,
    balanceSheet: balance,
    cashFlow,
  };

  // (c) One warning per field that was unmapped in at least one year.
  for (const [field, years] of unmappedYears) {
    warnings.push(
      `Field '${field}' has no source tag in the extraction; defaulted to 0 ` +
        `for fiscal year(s) ${years.join(", ")}.`,
    );
  }

  // (e) Tie-outs on the assembled result, then forward input extraction warnings.
  runTieOuts(statements, unmappedYears, warnings);
  for (const report of sorted) {
    for (const w of report.extraction_warnings) {
      warnings.push(`Extraction warning (report ending ${report.period_end}): ${w}`);
    }
  }

  return { statements, warnings };
}

// ── Observations ────────────────────────────────────────────────────────────

/** One report column projected onto a single fiscal year. */
interface Observation {
  fiscalYear: string;
  audited: boolean;
  consolidated: boolean;
  isCurrent: boolean;
  /** Human-readable source, used in mismatch warnings and stable ordering. */
  source: string;
  /** Canonical tag → value; only non-null values are stored. */
  values: Map<string, number>;
}

function toObservation(
  report: ExtractionResult,
  column: "current" | "comparative",
): Observation | null {
  const periodEnd = column === "current" ? report.period_end : report.comparative_period_end;
  if (periodEnd === null) return null;

  return {
    fiscalYear: fiscalYearOf(periodEnd),
    // A comparative column presented inside an audited report is itself audited.
    audited: report.audited,
    consolidated: report.consolidated,
    isCurrent: column === "current",
    source: `${column} column of report ending ${report.period_end}`,
    values: collectValues(report, column),
  };
}

function collectValues(
  report: ExtractionResult,
  column: "current" | "comparative",
): Map<string, number> {
  const values = new Map<string, number>();
  const lines: ExtractionLine[] = [
    ...report.statements.income_statement,
    ...report.statements.balance_sheet,
    ...report.statements.cash_flow,
  ];
  for (const line of lines) {
    if (line.tag === null) continue; // untagged lines are ignored
    const v = column === "current" ? line.value : line.value_comparative;
    if (v === null) continue;
    // Keep the first non-null occurrence of a tag within the report.
    if (!values.has(line.tag)) values.set(line.tag, v);
  }
  return values;
}

/**
 * Fiscal-year label = the calendar year of the period-end date. SIA's year
 * ending 2025-03-31 is "FY2025" → "2025"; a 31-December year-end lands on the
 * same convention.
 */
function fiscalYearOf(periodEnd: string): string {
  return periodEnd.slice(0, 4);
}

/**
 * Overlap ranking: AUDITED figures dominate, then consolidated (group) over
 * standalone, then a report's own current column over a comparative column.
 */
function rank(o: Observation): number {
  return (o.audited ? 4 : 0) + (o.consolidated ? 2 : 0) + (o.isCurrent ? 1 : 0);
}

/**
 * Merge every observation of one fiscal year into a single tag→value map. When
 * observations disagree on a tag (e.g. the earlier report's current column vs
 * the later report's comparative column), the highest-ranked — i.e. preferring
 * the audited — value wins and a mismatch warning is pushed.
 */
function mergeYear(
  year: string,
  bucket: Observation[],
  warnings: string[],
): Map<string, number> {
  // Deterministic order: rank desc, then current before comparative, then by
  // source string — independent of the input report order.
  const ordered = [...bucket].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      Number(b.isCurrent) - Number(a.isCurrent) ||
      cmp(a.source, b.source),
  );

  const tags = new Set<string>();
  for (const obs of ordered) for (const tag of obs.values.keys()) tags.add(tag);

  const merged = new Map<string, number>();
  for (const tag of [...tags].sort(cmp)) {
    const holders = ordered.filter((o) => o.values.has(tag));
    const chosen = holders[0]!;
    const chosenValue = chosen.values.get(tag)!;
    const distinct = new Set(holders.map((o) => o.values.get(tag)!));
    if (distinct.size > 1) {
      const rendered = holders
        .map((o) => `${o.values.get(tag)!} (${o.source}${o.audited ? ", audited" : ""})`)
        .join(" vs ");
      warnings.push(
        `Overlap mismatch for fiscal year ${year}, field '${tag}': ${rendered}; ` +
          `preferred ${chosen.audited ? "audited " : ""}value ${chosenValue}.`,
      );
    }
    merged.set(tag, chosenValue);
  }
  return merged;
}

// ── Tag → field mapping (Part 3 table) ──────────────────────────────────────

interface FieldSpec<K extends string> {
  key: K;
  /** Returns the mapped value and whether any source tag was present. */
  compute: (m: Map<string, number>) => { value: number; mapped: boolean };
}

/** First present tag among `tags` (used for "a / b" alternative rows). */
function firstPresent(tags: string[]) {
  return (m: Map<string, number>) => {
    for (const t of tags) {
      const v = m.get(t);
      if (v !== undefined) return { value: v, mapped: true };
    }
    return { value: 0, mapped: false };
  };
}

/** Sum of every present tag among `tags` (used for "a + b" composite rows). */
function sumPresent(tags: string[]) {
  return (m: Map<string, number>) => {
    let value = 0;
    let mapped = false;
    for (const t of tags) {
      const v = m.get(t);
      if (v !== undefined) {
        value += v;
        mapped = true;
      }
    }
    return { value, mapped };
  };
}

/** commonEquity = share_capital (+ reserves, − treasury_shares). */
function commonEquity(m: Map<string, number>) {
  const sc = m.get("share_capital");
  const reserves = m.get("reserves");
  const treasury = m.get("treasury_shares");
  const mapped = sc !== undefined || reserves !== undefined || treasury !== undefined;
  const value = (sc ?? 0) + (reserves ?? 0) - (treasury ?? 0);
  return { value, mapped };
}

type IncomeKey = keyof FinancialStatements["incomeStatement"];
type BalanceKey = keyof FinancialStatements["balanceSheet"];

const INCOME_SPECS: FieldSpec<IncomeKey>[] = [
  { key: "revenue", compute: firstPresent(["revenue"]) },
  { key: "cogs", compute: firstPresent(["cost_of_sales"]) },
  { key: "sga", compute: sumPresent(["administrative_expenses", "distribution_costs"]) },
  { key: "dandA", compute: firstPresent(["depreciation_amortization"]) },
  // "other_expenses / operating_expenses" — either, other_expenses preferred.
  { key: "otherOpEx", compute: firstPresent(["other_expenses", "operating_expenses"]) },
  { key: "ebit", compute: firstPresent(["operating_profit"]) },
  { key: "interestExpense", compute: firstPresent(["finance_costs"]) },
  { key: "interestIncome", compute: firstPresent(["finance_income"]) },
  { key: "incomeTaxExpense", compute: firstPresent(["tax_expense"]) },
  { key: "netIncome", compute: firstPresent(["net_profit"]) },
  { key: "minorityInterest", compute: firstPresent(["profit_attributable_to_nci"]) },
];

const BALANCE_SPECS: FieldSpec<BalanceKey>[] = [
  { key: "cash", compute: firstPresent(["cash_and_equivalents"]) },
  { key: "shortTermInvestments", compute: firstPresent(["short_term_investments"]) },
  { key: "receivables", compute: sumPresent(["trade_receivables", "other_receivables"]) },
  { key: "inventory", compute: firstPresent(["inventories"]) },
  { key: "prepaid", compute: firstPresent(["prepaid_expenses"]) },
  { key: "otherCurrentAssets", compute: firstPresent(["other_current_assets"]) },
  // netPPE folds right-of-use assets into PP&E: under IFRS 16 the ROU asset is
  // the capitalised leased equivalent of owned PP&E, and the paired lease
  // liabilities are already carried as debt — so treating ROU as part of the
  // productive asset base keeps the balance sheet internally consistent.
  { key: "netPPE", compute: sumPresent(["ppe", "right_of_use_assets"]) },
  {
    key: "longTermInvestments",
    compute: sumPresent(["long_term_investments", "investments_in_associates_jv"]),
  },
  { key: "goodwill", compute: firstPresent(["goodwill"]) },
  { key: "intangibles", compute: firstPresent(["intangible_assets"]) },
  { key: "otherLTAssets", compute: sumPresent(["other_non_current_assets", "deferred_tax_assets"]) },
  { key: "totalAssets", compute: firstPresent(["total_assets"]) },
  { key: "accountsPayable", compute: firstPresent(["trade_payables"]) },
  // "accrued_expenses / other_payables" — either, accrued_expenses preferred.
  { key: "accrued", compute: firstPresent(["accrued_expenses", "other_payables"]) },
  { key: "currentPortionLTDebt", compute: firstPresent(["borrowings_current"]) },
  { key: "currentLeases", compute: firstPresent(["lease_liabilities_current"]) },
  { key: "taxesPayable", compute: firstPresent(["current_tax_payable"]) },
  { key: "unearnedRevCurrent", compute: firstPresent(["deferred_revenue_current"]) },
  { key: "otherCurrentLiabilities", compute: firstPresent(["other_current_liabilities"]) },
  { key: "longTermDebt", compute: firstPresent(["borrowings_non_current"]) },
  { key: "longTermLeases", compute: firstPresent(["lease_liabilities_non_current"]) },
  { key: "pensionOPEB", compute: firstPresent(["pension_opeb"]) },
  { key: "deferredTaxLiability", compute: firstPresent(["deferred_tax_liabilities"]) },
  { key: "otherNonCurrentLiabilities", compute: firstPresent(["other_non_current_liabilities"]) },
  { key: "totalLiabilities", compute: firstPresent(["total_liabilities"]) },
  { key: "commonEquity", compute: commonEquity },
  { key: "retainedEarnings", compute: firstPresent(["retained_earnings"]) },
  { key: "minorityInterest", compute: firstPresent(["non_controlling_interests"]) },
  { key: "totalEquity", compute: firstPresent(["total_equity"]) },
  { key: "bookValueOfEquity", compute: firstPresent(["equity_attributable_to_owners"]) },
];

const CF_DANDA: FieldSpec<"dandA"> = {
  key: "dandA",
  compute: firstPresent(["depreciation_amortization"]),
};
const CF_CAPEX: FieldSpec<"capex"> = {
  key: "capex",
  compute: firstPresent(["capex_purchase_of_ppe"]),
};
const CF_DIVIDENDS: FieldSpec<"commonDividendsPaid"> = {
  key: "commonDividendsPaid",
  compute: firstPresent(["dividends_paid"]),
};

/**
 * Evaluate one field for one year: return its value and, when no source tag was
 * present, default to 0 and record the year against `field` for a warning.
 */
function evalField(
  spec: FieldSpec<string>,
  yearValues: Map<string, number>,
  year: string,
  field: string,
  unmappedYears: Map<string, string[]>,
): number {
  const { value, mapped } = spec.compute(yearValues);
  if (!mapped) {
    const list = unmappedYears.get(field);
    if (list) list.push(year);
    else unmappedYears.set(field, [year]);
  }
  return value;
}

// ── Derivations & tie-outs ──────────────────────────────────────────────────

/** Year-over-year first differences; the opening year has no prior, so it is 0. */
function yoy(series: number[]): number[] {
  return series.map((v, i) => (i === 0 ? 0 : v - series[i - 1]!));
}

/**
 * (e) Re-run the accounting identity totalAssets == totalLiabilities +
 * totalEquity for each year. Only years where all three totals were actually
 * mapped are checked, so sparse extractions don't raise spurious tie-out
 * failures. Any real break is pushed as a warning.
 */
function runTieOuts(
  statements: FinancialStatements,
  unmappedYears: Map<string, string[]>,
  warnings: string[],
): void {
  const { fiscalYears, balanceSheet } = statements;
  const totalAssetsUnmapped = new Set(unmappedYears.get("balanceSheet.totalAssets") ?? []);
  const totalLiabilitiesUnmapped = new Set(
    unmappedYears.get("balanceSheet.totalLiabilities") ?? [],
  );
  const totalEquityUnmapped = new Set(unmappedYears.get("balanceSheet.totalEquity") ?? []);

  fiscalYears.forEach((year, i) => {
    if (
      totalAssetsUnmapped.has(year) ||
      totalLiabilitiesUnmapped.has(year) ||
      totalEquityUnmapped.has(year)
    ) {
      return; // don't tie out on defaulted zeros
    }
    const assets = balanceSheet.totalAssets[i]!;
    const liabPlusEquity = balanceSheet.totalLiabilities[i]! + balanceSheet.totalEquity[i]!;
    const diff = Math.abs(assets - liabPlusEquity);
    const tol = 1e-4 * Math.max(1, Math.abs(assets), Math.abs(liabPlusEquity));
    if (diff > tol) {
      warnings.push(
        `Tie-out failure for fiscal year ${year}: total assets ${assets} != ` +
          `total liabilities + total equity ${liabPlusEquity} (difference ${assets - liabPlusEquity}).`,
      );
    }
  });
}

/** Lexicographic string compare returning -1 / 0 / 1. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
