/**
 * Normalization of Polygon's `GET /vX/reference/financials` result rows (one
 * row per reporting period, each carrying `financials.<category>.<field>`
 * value objects) into the canonical statement/period/line-item shape, with
 * per-field provenance.
 *
 * Pure (rows in, canonical fragment out) so it can be exhaustively tested
 * against fixed Polygon fixtures without any network. The adapter
 * (`polygonAdapter.ts`) is the only part that does I/O.
 */
import {
  provenanceKey,
  type CanonicalFinancials,
  type CanonicalLineItem,
  type CanonicalStatement,
  type CanonicalStatementPeriod,
  type CurrencyCode,
  type PeriodFrequency,
  type ProvenanceMap,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";

import { POLYGON_CONFIDENCE, POLYGON_SOURCE, POLYGON_TIER } from "./config";
import { CONCEPT_MAP, STATEMENT_CATEGORY, type ConceptDef } from "./concepts";

/** One field within a Polygon `financials.<category>` object: the reported value plus its unit/label metadata. */
export interface PolygonFinancialValue {
  value?: number;
  unit?: string;
  label?: string;
  order?: number;
  [field: string]: unknown;
}

/** The `financials.<category>` object of a Polygon result row: field name -> its value/unit. */
export type PolygonFinancialsBlock = Record<string, PolygonFinancialValue | undefined>;

/** One row (one reporting period) of Polygon's `GET /vX/reference/financials` `results` array. */
export interface PolygonFinancialsRow {
  cik?: string;
  company_name?: string;
  start_date?: string;
  end_date?: string;
  filing_date?: string;
  fiscal_period?: string;
  fiscal_year?: string;
  timeframe?: string;
  financials?: {
    income_statement?: PolygonFinancialsBlock;
    balance_sheet?: PolygonFinancialsBlock;
    cash_flow_statement?: PolygonFinancialsBlock;
    [category: string]: PolygonFinancialsBlock | undefined;
  };
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
 * Interprets a Polygon value-object `unit` string (e.g. `"USD"`,
 * `"USD / shares"`, `"shares"`, `"pure"`): the leading 3-letter currency
 * code, if any - present for monetary and per-share units alike (a per-share
 * figure is still denominated in a currency), `null` for bare share-count or
 * dimensionless ("shares", "pure") units.
 */
function currencyFromUnit(unit: string | undefined): CurrencyCode | null {
  if (typeof unit !== "string") return null;
  const match = /^([A-Z]{3})\b/.exec(unit.trim());
  return match ? (match[1] ?? null) : null;
}

/** Reads one concept's value object off a row, treating a missing/non-finite value as absent. */
function readValue(row: PolygonFinancialsRow, category: string, field: string): PolygonFinancialValue | null {
  const block = row.financials?.[category];
  const entry = block?.[field];
  if (!entry || typeof entry.value !== "number" || !Number.isFinite(entry.value)) return null;
  return entry;
}

/** Sorts rows oldest -> newest by `end_date` and keeps only the most recent `limit` of them. */
function selectRecentRows(rows: PolygonFinancialsRow[], limit: number): PolygonFinancialsRow[] {
  const sorted = [...rows]
    .filter((row) => typeof row.end_date === "string" && row.end_date.length > 0)
    .sort((a, b) => (a.end_date as string).localeCompare(b.end_date as string));
  return limit >= sorted.length ? sorted : sorted.slice(sorted.length - limit);
}

function provenanceFor(row: PolygonFinancialsRow): ProvenanceRecord {
  return {
    source: POLYGON_SOURCE,
    tier: POLYGON_TIER,
    asOf: toIsoDateTime(row.filing_date ?? row.end_date),
    periodEnd: row.end_date ?? null,
    rawUnits: "ones",
    confidence: POLYGON_CONFIDENCE,
  };
}

/**
 * Normalizes one of the three core statements from Polygon's annual +
 * quarterly row arrays into the canonical `annual`/`quarterly` period arrays
 * (oldest -> newest, capped to the configured window), with a provenance
 * record per emitted data point keyed by `provenanceKey`.
 */
export function buildStatement(
  statementName: keyof CanonicalFinancials,
  rows: { annual: PolygonFinancialsRow[]; quarterly: PolygonFinancialsRow[] },
  options: { maxAnnualPeriods: number; maxQuarterlyPeriods: number },
): StatementResult {
  const concepts: ConceptDef[] = CONCEPT_MAP[statementName];
  const category = STATEMENT_CATEGORY[statementName];
  const annualRows = selectRecentRows(rows.annual, options.maxAnnualPeriods);
  const quarterlyRows = selectRecentRows(rows.quarterly, options.maxQuarterlyPeriods);

  const provenance: ProvenanceMap = {};
  const seenTags = new Set<string>();

  const buildPeriods = (frequency: PeriodFrequency, periodRows: PolygonFinancialsRow[]): CanonicalStatementPeriod[] =>
    periodRows.map((row, periodIndex) => {
      const period: CanonicalLineItem[] = [];
      for (const concept of concepts) {
        const entry = readValue(row, category, concept.field);
        if (entry === null) continue;
        seenTags.add(concept.tag);
        period.push({
          tag: concept.tag,
          label: typeof entry.label === "string" && entry.label.length > 0 ? entry.label : concept.label,
          value: {
            raw: entry.value as number,
            units: "ones",
            currency: currencyFromUnit(entry.unit),
            periodEnd: row.end_date ?? null,
          },
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
