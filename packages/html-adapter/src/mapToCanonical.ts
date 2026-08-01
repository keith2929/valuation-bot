/**
 * Tier 4 canonical-mapping half: turns the intermediate `ParsedTable` rows
 * produced by `fetchAndParseFinancials` into canonical line items, gated by
 * what more authoritative tiers already resolved. Scraped HTML is the
 * last-resort source - no schema contract with the publisher, and the page
 * layout can change without notice - so this tier only ever *fills a gap*: a
 * field the caller's `existing` (tiers 1-3, already merged) data still has as
 * `null` for a given period. It never overwrites a value a higher tier
 * already supplied.
 *
 * Never throws: unparseable headers/cells and unrecognized row labels simply
 * mean that field is skipped (not guessed at), and a page missing a whole
 * statement table degrades to a note rather than an error.
 */
import { adapterError } from "@valuation-bot/source-adapter";
import type { PartialCanonicalFinancials } from "@valuation-bot/source-adapter";
import {
  createEmptyCanonicalFinancialData,
  provenanceKey,
  type CanonicalError,
  type CanonicalFinancials,
  type CanonicalLineItem,
  type CanonicalStatement,
  type CanonicalStatementPeriod,
  type IsoDate,
  type ProvenanceMap,
  type ProvenanceRecord,
} from "@valuation-bot/canonical";

import { matchHtmlConceptTag } from "./concepts";
import { HTML_CONFIDENCE, HTML_SOURCE, HTML_TIER } from "./config";
import type { HtmlStatementKind } from "./config";
import { parseHtmlPeriodHeader } from "./parsePeriod";
import { parseHtmlNumericCell } from "./parseValue";
import type { HtmlFinancialTables, ParsedTable } from "./types";

export interface HtmlCanonicalMappingResult {
  financials: PartialCanonicalFinancials;
  /** Keyed by `provenanceKey(statement, "annual", periodIndex, tag)`, one entry per filled field. */
  provenance: ProvenanceMap;
  errors: CanonicalError[];
}

export interface HtmlCanonicalMappingOptions {
  /** Recorded as each filled field's provenance `asOf`; defaults to the current time. */
  fetchTimestamp?: string;
}

const STATEMENT_KINDS: HtmlStatementKind[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/** True if `existing` already has a non-null value for `tag` at `periodEnd`, in any frequency - a higher tier already covered this field. */
function isAlreadyFilled(existing: CanonicalStatement, tag: string, periodEnd: string): boolean {
  const periods = [...existing.annual, ...existing.quarterly, ...(existing.ltm ? [existing.ltm] : [])];
  return periods.some((period) =>
    period.some((item) => item.tag === tag && item.value.periodEnd === periodEnd && item.value.raw !== null),
  );
}

function provenanceFor(periodEnd: IsoDate, fetchTimestamp: string): ProvenanceRecord {
  return {
    source: HTML_SOURCE,
    tier: HTML_TIER,
    asOf: fetchTimestamp,
    periodEnd,
    rawUnits: null,
    confidence: HTML_CONFIDENCE,
  };
}

/**
 * Maps one statement's `ParsedTable` into the canonical annual periods still
 * missing from `existing`, plus per-field provenance. Every column header
 * that can't be parsed into a period end, and every row label that doesn't
 * match a known canonical concept, is silently skipped - this tier only ever
 * contributes fields it can identify with reasonable confidence. A period
 * with nothing left to fill (every recognized field already covered by a
 * higher tier, or none parseable) is simply absent from the result rather
 * than emitted empty.
 */
function mapStatementTable(
  statementKind: HtmlStatementKind,
  table: ParsedTable,
  existing: CanonicalStatement,
  fetchTimestamp: string,
): { annual: CanonicalStatementPeriod[]; provenance: ProvenanceMap } {
  const periodEnds = table.headers.map((header) => parseHtmlPeriodHeader(header));
  const itemsByPeriodEnd = new Map<string, CanonicalLineItem[]>();

  for (const row of table.rows) {
    const concept = matchHtmlConceptTag(row.label, statementKind);
    if (!concept) continue;

    row.values.forEach((cellText, columnIndex) => {
      const periodEnd = periodEnds[columnIndex];
      if (!periodEnd) return;
      if (isAlreadyFilled(existing, concept.tag, periodEnd)) return;

      const raw = parseHtmlNumericCell(cellText);
      if (raw === null) return;

      const items = itemsByPeriodEnd.get(periodEnd) ?? [];
      if (items.some((item) => item.tag === concept.tag)) return; // first row matching a tag wins; a later duplicate caption for the same concept is ignored
      items.push({ tag: concept.tag, label: concept.label, value: { raw, units: null, currency: null, periodEnd } });
      itemsByPeriodEnd.set(periodEnd, items);
    });
  }

  const orderedPeriodEnds = Array.from(itemsByPeriodEnd.keys()).sort((a, b) => a.localeCompare(b));
  const provenance: ProvenanceMap = {};
  const annual = orderedPeriodEnds.map((periodEnd, periodIndex) => {
    const items = itemsByPeriodEnd.get(periodEnd) ?? [];
    for (const item of items) {
      provenance[provenanceKey(statementKind, "annual", periodIndex, item.tag as string)] = provenanceFor(
        periodEnd,
        fetchTimestamp,
      );
    }
    return items;
  });

  return { annual, provenance };
}

/**
 * Maps a page's classified `HtmlFinancialTables` into a partial canonical
 * fragment containing only fields still `null` in `existing` (tiers 1-3,
 * already merged) - the "true per-field last resort" this tier is meant to
 * be. `existing` defaults to an all-null `CanonicalFinancials` when omitted,
 * which degrades to "fill everything this page can identify".
 */
export function mapHtmlTablesToCanonicalFinancials(
  tables: HtmlFinancialTables,
  existing: CanonicalFinancials = createEmptyCanonicalFinancialData().financials,
  options: HtmlCanonicalMappingOptions = {},
): HtmlCanonicalMappingResult {
  const fetchTimestamp = options.fetchTimestamp ?? new Date().toISOString();
  const financials: PartialCanonicalFinancials = {};
  const provenance: ProvenanceMap = {};
  const errors: CanonicalError[] = [];

  for (const kind of STATEMENT_KINDS) {
    const table = tables[kind];
    if (!table) {
      errors.push(adapterError(HTML_SOURCE, `no parsed ${kind} table available to map`, { field: kind }));
      continue;
    }

    const mapped = mapStatementTable(kind, table, existing[kind], fetchTimestamp);
    if (mapped.annual.length === 0) {
      errors.push(
        adapterError(HTML_SOURCE, `no fillable ${kind} fields found (all recognized fields already covered, or none recognized)`, {
          field: kind,
        }),
      );
      continue;
    }

    financials[kind] = { annual: mapped.annual, quarterly: [], ltm: null };
    Object.assign(provenance, mapped.provenance);
  }

  return { financials, provenance, errors };
}
