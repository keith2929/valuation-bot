/**
 * Normalization of FMP's as-returned statement rows (one row per reporting
 * period) into the canonical statement/period/line-item shape, with per-field
 * provenance.
 *
 * Pure (rows in, canonical fragment out) so it can be exhaustively tested
 * against fixed FMP fixtures without any network. The adapter
 * (`fmpAdapter.ts`) is the only part that does I/O.
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

import { FMP_CONFIDENCE, FMP_SOURCE, FMP_TIER } from "./config";
import { CONCEPT_MAP } from "./concepts";

/**
 * One row of an FMP income-statement/balance-sheet-statement/cash-flow-statement
 * response. FMP already normalizes each statement to a stable, well-known set
 * of field names, so beyond the common identifying fields this is an open bag
 * of numeric line items looked up dynamically via `CONCEPT_MAP`.
 */
export interface FmpStatementRow {
  date?: string;
  symbol?: string;
  reportedCurrency?: string;
  fillingDate?: string;
  acceptedDate?: string;
  period?: string;
  [field: string]: unknown;
}

/** Result of normalizing one statement: the canonical statement, its provenance, and any concepts never present in any row. */
export interface StatementResult {
  statement: CanonicalStatement;
  provenance: ProvenanceMap;
  /** Canonical tags with no numeric value in any annual or quarterly row. */
  missingTags: string[];
}

/** "2023-09-30" -> "2023-09-30T00:00:00Z"; "2023-11-02 18:08:27" -> "2023-11-02T18:08:27Z"; passes through an already-zoned value; null/empty -> null. */
export function toIsoDateTime(raw: string | undefined | null): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(raw)) {
    const withT = raw.replace(" ", "T");
    return /[zZ]|[+-]\d{2}:\d{2}$/.test(withT) ? withT : `${withT}Z`;
  }
  return raw;
}

/** Reads a numeric field off a row, treating non-finite/non-number values (including `null`, which FMP uses for "not reported") as absent. */
function readNumber(row: FmpStatementRow, field: string): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Sorts rows oldest -> newest by `date` and keeps only the most recent `limit` of them. */
function selectRecentRows(rows: FmpStatementRow[], limit: number): FmpStatementRow[] {
  const sorted = [...rows]
    .filter((row) => typeof row.date === "string" && row.date.length > 0)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return limit >= sorted.length ? sorted : sorted.slice(sorted.length - limit);
}

function provenanceFor(row: FmpStatementRow): ProvenanceRecord {
  return {
    source: FMP_SOURCE,
    tier: FMP_TIER,
    asOf: toIsoDateTime(row.fillingDate ?? row.acceptedDate ?? row.date),
    periodEnd: row.date ?? null,
    rawUnits: "ones",
    confidence: FMP_CONFIDENCE,
  };
}

/**
 * Normalizes one of the three core statements from FMP's annual + quarterly
 * row arrays into the canonical `annual`/`quarterly` period arrays
 * (oldest -> newest, capped to the configured window), with a provenance
 * record per emitted data point keyed by `provenanceKey`.
 */
export function buildStatement(
  statementName: keyof CanonicalFinancials,
  rows: { annual: FmpStatementRow[]; quarterly: FmpStatementRow[] },
  options: { maxAnnualPeriods: number; maxQuarterlyPeriods: number },
): StatementResult {
  const concepts = CONCEPT_MAP[statementName];
  const annualRows = selectRecentRows(rows.annual, options.maxAnnualPeriods);
  const quarterlyRows = selectRecentRows(rows.quarterly, options.maxQuarterlyPeriods);

  const provenance: ProvenanceMap = {};
  const seenTags = new Set<string>();

  const buildPeriods = (frequency: PeriodFrequency, periodRows: FmpStatementRow[]): CanonicalStatementPeriod[] =>
    periodRows.map((row, periodIndex) => {
      const period: CanonicalLineItem[] = [];
      for (const concept of concepts) {
        const raw = readNumber(row, concept.field);
        if (raw === null) continue;
        seenTags.add(concept.tag);
        period.push({
          tag: concept.tag,
          label: concept.label,
          value: { raw, units: "ones", currency: row.reportedCurrency ?? null, periodEnd: row.date ?? null },
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
