/**
 * Normalization of Alpha Vantage's as-returned statement rows (one row per
 * reporting period, from `INCOME_STATEMENT`/`BALANCE_SHEET`/`CASH_FLOW`'s
 * `annualReports`/`quarterlyReports` arrays) into the canonical
 * statement/period/line-item shape, with per-field provenance.
 *
 * Pure (rows in, canonical fragment out) so it can be exhaustively tested
 * against fixed Alpha Vantage fixtures without any network. The adapter
 * (`alphaVantageAdapter.ts`) is the only part that does I/O.
 */
import {
  provenanceKey,
  type CanonicalFinancials,
  type CanonicalLineItem,
  type CanonicalStatement,
  type CanonicalStatementPeriod,
  type PeriodFrequency,
  type ProvenanceMap,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";

import { ALPHA_VANTAGE_CONFIDENCE, ALPHA_VANTAGE_SOURCE, ALPHA_VANTAGE_TIER } from "./config";
import { CONCEPT_MAP } from "./concepts";

/**
 * One row of an Alpha Vantage `INCOME_STATEMENT`/`BALANCE_SHEET`/`CASH_FLOW`
 * `annualReports`/`quarterlyReports` entry. Unlike FMP, Alpha Vantage reports
 * every numeric line item as a *string* (and uses the literal string
 * `"None"` for a concept it has no value for), so line items are looked up
 * dynamically via `CONCEPT_MAP` and parsed with `readNumber` below.
 */
export interface AlphaVantageStatementRow {
  fiscalDateEnding?: string;
  reportedCurrency?: string;
  [field: string]: unknown;
}

/** Result of normalizing one statement: the canonical statement, its provenance, and any concepts never present in any row. */
export interface StatementResult {
  statement: CanonicalStatement;
  provenance: ProvenanceMap;
  /** Canonical tags with no numeric value in any annual or quarterly row. */
  missingTags: string[];
}

/** "2023-09-30" -> "2023-09-30T00:00:00Z"; passes through an already-zoned value; null/empty -> null. */
export function toIsoDateTime(raw: string | undefined | null): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00Z`;
  return raw;
}

/**
 * Reads a numeric field off a row. Alpha Vantage reports figures as strings
 * and uses the literal string `"None"` (and sometimes `"-"`) for a concept it
 * doesn't have a value for - both, plus a non-numeric string, are treated as
 * absent rather than `NaN`/`0`.
 */
function readNumber(row: AlphaVantageStatementRow, field: string): number | null {
  const value = row[field];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "None" || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads the first field in `fields` that carries a numeric value on `row`. */
function readConceptValue(row: AlphaVantageStatementRow, fields: string[]): number | null {
  for (const field of fields) {
    const value = readNumber(row, field);
    if (value !== null) return value;
  }
  return null;
}

/** Sorts rows oldest -> newest by `fiscalDateEnding` and keeps only the most recent `limit` of them. */
function selectRecentRows(rows: AlphaVantageStatementRow[], limit: number): AlphaVantageStatementRow[] {
  const sorted = [...rows]
    .filter((row) => typeof row.fiscalDateEnding === "string" && row.fiscalDateEnding.length > 0)
    .sort((a, b) => (a.fiscalDateEnding as string).localeCompare(b.fiscalDateEnding as string));
  return limit >= sorted.length ? sorted : sorted.slice(sorted.length - limit);
}

function provenanceFor(row: AlphaVantageStatementRow): ProvenanceRecord {
  return {
    source: ALPHA_VANTAGE_SOURCE,
    tier: ALPHA_VANTAGE_TIER,
    // Alpha Vantage's statement rows carry no separate filing/accepted date -
    // fiscalDateEnding is the only date on the row, so it doubles as asOf.
    asOf: toIsoDateTime(row.fiscalDateEnding),
    periodEnd: row.fiscalDateEnding ?? null,
    rawUnits: "ones",
    confidence: ALPHA_VANTAGE_CONFIDENCE,
  };
}

/**
 * Normalizes one of the three core statements from Alpha Vantage's annual +
 * quarterly row arrays into the canonical `annual`/`quarterly` period arrays
 * (oldest -> newest, capped to the configured window), with a provenance
 * record per emitted data point keyed by `provenanceKey`.
 */
export function buildStatement(
  statementName: keyof CanonicalFinancials,
  rows: { annual: AlphaVantageStatementRow[]; quarterly: AlphaVantageStatementRow[] },
  options: { maxAnnualPeriods: number; maxQuarterlyPeriods: number },
): StatementResult {
  const concepts = CONCEPT_MAP[statementName];
  const annualRows = selectRecentRows(rows.annual, options.maxAnnualPeriods);
  const quarterlyRows = selectRecentRows(rows.quarterly, options.maxQuarterlyPeriods);

  const provenance: ProvenanceMap = {};
  const seenTags = new Set<string>();

  const buildPeriods = (frequency: PeriodFrequency, periodRows: AlphaVantageStatementRow[]): CanonicalStatementPeriod[] =>
    periodRows.map((row, periodIndex) => {
      const period: CanonicalLineItem[] = [];
      for (const concept of concepts) {
        const raw = readConceptValue(row, concept.fields);
        if (raw === null) continue;
        seenTags.add(concept.tag);
        period.push({
          tag: concept.tag,
          label: concept.label,
          value: { raw, units: "ones", currency: row.reportedCurrency ?? null, periodEnd: row.fiscalDateEnding ?? null },
        });
        provenance[provenanceKey(statementName, frequency, periodIndex, concept.tag)] = provenanceFor(row);
      }
      return period;
    });

  const statement: CanonicalStatement = {
    annual: buildPeriods("annual", annualRows),
    quarterly: buildPeriods("quarterly", quarterlyRows),
    ltm: null,
  };

  const missingTags = concepts.map((concept) => concept.tag).filter((tag) => !seenTags.has(tag));

  return { statement, provenance, missingTags };
}
