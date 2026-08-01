/**
 * Normalization of Yahoo Finance's `quoteSummary` statement-history rows into
 * the canonical statement/period/line-item shape, with per-field provenance
 * (source=yfinance, tier=3).
 *
 * Pure (rows in, canonical fragment out) so it can be exhaustively tested
 * against fixed fixtures without any network. The adapter
 * (`yfinanceAdapter.ts`) is the only part that does I/O.
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

import { CONCEPT_MAP } from "./concepts";
import { YFINANCE_CONFIDENCE, YFINANCE_SOURCE, YFINANCE_TIER } from "./config";
import { readYahooDate, readYahooNumber, type YahooNumeric, type YahooStatementRow } from "./types";

/** Result of normalizing one statement: the canonical statement, its provenance, and any concepts never present in any row. */
export interface StatementResult {
  statement: CanonicalStatement;
  provenance: ProvenanceMap;
  /** Canonical tags with no numeric value in any annual or quarterly row. */
  missingTags: string[];
}

/** Sorts rows oldest -> newest by `endDate` and keeps only the most recent `limit` of them. Rows with no readable `endDate` are dropped. */
function selectRecentRows(rows: YahooStatementRow[], limit: number): { row: YahooStatementRow; periodEnd: string }[] {
  const dated = rows
    .map((row) => ({ row, periodEnd: readYahooDate(row.endDate) }))
    .filter((entry): entry is { row: YahooStatementRow; periodEnd: string } => entry.periodEnd !== null)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return limit >= dated.length ? dated : dated.slice(dated.length - limit);
}

function provenanceFor(periodEnd: string, fetchTimestamp: string): ProvenanceRecord {
  return {
    source: YFINANCE_SOURCE,
    tier: YFINANCE_TIER,
    asOf: fetchTimestamp,
    periodEnd,
    rawUnits: "ones",
    confidence: YFINANCE_CONFIDENCE,
  };
}

/**
 * Normalizes one of the three core statements from Yahoo's annual + quarterly
 * row arrays into the canonical `annual`/`quarterly` period arrays
 * (oldest -> newest, capped to the configured window), with a provenance
 * record per emitted data point keyed by `provenanceKey`. Yahoo's statement
 * rows carry no reporting currency field, so `value.currency` is left `null`
 * (unlike `@valuation-bot/fmp-adapter`, which reads `reportedCurrency`).
 */
export function buildStatement(
  statementName: keyof CanonicalFinancials,
  rows: { annual: YahooStatementRow[]; quarterly: YahooStatementRow[] },
  options: { maxAnnualPeriods: number; maxQuarterlyPeriods: number; fetchTimestamp: string },
): StatementResult {
  const concepts = CONCEPT_MAP[statementName];
  const annualRows = selectRecentRows(rows.annual, options.maxAnnualPeriods);
  const quarterlyRows = selectRecentRows(rows.quarterly, options.maxQuarterlyPeriods);

  const provenance: ProvenanceMap = {};
  const seenTags = new Set<string>();

  const buildPeriods = (
    frequency: PeriodFrequency,
    periodRows: { row: YahooStatementRow; periodEnd: string }[],
  ): CanonicalStatementPeriod[] =>
    periodRows.map(({ row, periodEnd }, periodIndex) => {
      const period: CanonicalLineItem[] = [];
      for (const concept of concepts) {
        const raw = readYahooNumber(row[concept.field] as YahooNumeric);
        if (raw === null) continue;
        seenTags.add(concept.tag);
        period.push({
          tag: concept.tag,
          label: concept.label,
          value: { raw, units: "ones", currency: null, periodEnd },
        });
        provenance[provenanceKey(statementName, frequency, periodIndex, concept.tag)] = provenanceFor(
          periodEnd,
          options.fetchTimestamp,
        );
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
