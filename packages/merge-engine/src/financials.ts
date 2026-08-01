/**
 * Deep per-field merge of the three core statements across an ordered list of
 * source fragments.
 *
 * The hard requirement here is "never truncate below a source's available
 * history": sources disagree on how many periods they report, so periods are
 * *unioned* by their reporting `periodEnd` (not intersected, and never capped
 * to the shortest source). Within each merged period every canonical field
 * (identified by its `tag`) is filled from the first fragment that reports a
 * non-null value for it, and that fragment's provenance record is re-keyed to
 * the merged period index. Untagged, market-specific line items are preserved
 * (deduped by label, first source wins) rather than dropped.
 *
 * Pure and deterministic: statement/frequency order is fixed, periods sort
 * oldest -> newest by date, and field/label ordering follows first-appearance,
 * so identical inputs always yield byte-identical output. No I/O.
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
import { type AdapterFragment } from "@valuation-bot/source-adapter";

/** The three core statements, in stable iteration order. */
const STATEMENT_KINDS = ["incomeStatement", "balanceSheet", "cashFlow"] as const;
type StatementKind = (typeof STATEMENT_KINDS)[number];

/** The multi-period frequencies (LTM is a single period, handled separately). */
const SERIES_FREQUENCIES = ["annual", "quarterly"] as const;
type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];

export interface FinancialsMergeResult {
  financials: CanonicalFinancials;
  /** Provenance keyed by `provenanceKey(statement, frequency, mergedPeriodIndex, tag)`. */
  provenance: ProvenanceMap;
}

/**
 * One fragment's contribution to a single merged period: the period's line
 * items plus the fragment's own financials provenance map and the period index
 * the fragment used (needed to look that provenance up under the *fragment's*
 * key before re-keying to the merged index).
 */
interface PeriodContribution {
  period: CanonicalStatementPeriod;
  fragmentProvenance: ProvenanceMap;
  fragmentPeriodIndex: number;
}

/** The reporting date a period is keyed by: the first non-empty `periodEnd` among its line items, else null (unkeyable). */
function periodEndOf(period: CanonicalStatementPeriod): string | null {
  for (const item of period) {
    const end = item.value.periodEnd;
    if (end !== null && end !== "") return end;
  }
  return null;
}

/** Normalizes a caption for cross-source dedup of untagged line items (case/space-insensitive). */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merges one group of contributions that all share the same reporting period
 * into a single canonical period plus its provenance (keyed at `mergedIndex`).
 * Contributions must already be in priority order (highest-priority source
 * first) so that first-seen == winner.
 */
function mergePeriodGroup(
  kind: StatementKind,
  frequency: PeriodFrequency,
  mergedIndex: number,
  contributions: readonly PeriodContribution[],
): { period: CanonicalStatementPeriod; provenance: ProvenanceMap } {
  const tagOrder: string[] = [];
  const firstSeen = new Map<string, CanonicalLineItem>();
  const winners = new Map<string, { item: CanonicalLineItem; record: ProvenanceRecord | undefined }>();
  const untaggedSeen = new Set<string>();
  const untagged: CanonicalLineItem[] = [];

  for (const contribution of contributions) {
    for (const item of contribution.period) {
      if (item.tag !== null) {
        const tag = item.tag;
        if (!firstSeen.has(tag)) {
          firstSeen.set(tag, item);
          tagOrder.push(tag);
        }
        // First non-null value for this tag wins; remember its provenance.
        if (item.value.raw !== null && !winners.has(tag)) {
          const key = provenanceKey(kind, frequency, contribution.fragmentPeriodIndex, tag);
          winners.set(tag, { item, record: contribution.fragmentProvenance[key] });
        }
      } else {
        const labelKey = normalizeLabel(item.label);
        if (!untaggedSeen.has(labelKey)) {
          untaggedSeen.add(labelKey);
          untagged.push(item);
        }
      }
    }
  }

  const period: CanonicalStatementPeriod = [];
  const provenance: ProvenanceMap = {};
  for (const tag of tagOrder) {
    const winner = winners.get(tag);
    if (winner) {
      period.push(winner.item);
      if (winner.record !== undefined) {
        provenance[provenanceKey(kind, frequency, mergedIndex, tag)] = winner.record;
      }
    } else {
      // Seen only with null values across every source: keep it as a null
      // placeholder so the field remains represented rather than truncated.
      const placeholder = firstSeen.get(tag);
      if (placeholder) period.push(placeholder);
    }
  }
  for (const item of untagged) period.push(item);

  return { period, provenance };
}

/**
 * Merges one (statement, frequency) series across all fragments: unions
 * periods by reporting date, orders them oldest -> newest (undated periods
 * kept, each on its own, appended in encounter order), and merges each period
 * group field-by-field.
 */
function mergeSeries(
  fragments: readonly AdapterFragment[],
  kind: StatementKind,
  frequency: SeriesFrequency,
): { periods: CanonicalStatementPeriod[]; provenance: ProvenanceMap } {
  const dated = new Map<string, PeriodContribution[]>();
  const undated: PeriodContribution[] = [];

  for (const fragment of fragments) {
    const statement = fragment.financials[kind];
    if (statement === undefined) continue;
    for (const [fragmentPeriodIndex, period] of statement[frequency].entries()) {
      const contribution: PeriodContribution = {
        period,
        fragmentProvenance: fragment.provenance.financials,
        fragmentPeriodIndex,
      };
      const key = periodEndOf(period);
      if (key === null) {
        undated.push(contribution);
        continue;
      }
      const bucket = dated.get(key);
      if (bucket) bucket.push(contribution);
      else dated.set(key, [contribution]);
    }
  }

  const orderedGroups: PeriodContribution[][] = [];
  for (const key of [...dated.keys()].sort((a, b) => a.localeCompare(b))) {
    const bucket = dated.get(key);
    if (bucket) orderedGroups.push(bucket);
  }
  for (const contribution of undated) orderedGroups.push([contribution]);

  const periods: CanonicalStatementPeriod[] = [];
  const provenance: ProvenanceMap = {};
  orderedGroups.forEach((group, mergedIndex) => {
    const merged = mergePeriodGroup(kind, frequency, mergedIndex, group);
    periods.push(merged.period);
    Object.assign(provenance, merged.provenance);
  });

  return { periods, provenance };
}

/**
 * Merges the single LTM period across fragments. LTM has one period per
 * source; provenance is looked up (and emitted) at index 0, matching the
 * convention adapters use for the sole LTM period.
 */
function mergeLtm(
  fragments: readonly AdapterFragment[],
  kind: StatementKind,
): { ltm: CanonicalStatementPeriod | null; provenance: ProvenanceMap } {
  const contributions: PeriodContribution[] = [];
  for (const fragment of fragments) {
    const statement = fragment.financials[kind];
    if (statement === undefined || statement.ltm === null) continue;
    contributions.push({
      period: statement.ltm,
      fragmentProvenance: fragment.provenance.financials,
      fragmentPeriodIndex: 0,
    });
  }
  if (contributions.length === 0) return { ltm: null, provenance: {} };

  const merged = mergePeriodGroup(kind, "ltm", 0, contributions);
  return { ltm: merged.period, provenance: merged.provenance };
}

/** Merges the `financials` half of every fragment into one full `CanonicalFinancials` plus re-keyed provenance. */
export function mergeFinancials(fragments: readonly AdapterFragment[]): FinancialsMergeResult {
  const financials: CanonicalFinancials = {
    incomeStatement: { annual: [], quarterly: [], ltm: null },
    balanceSheet: { annual: [], quarterly: [], ltm: null },
    cashFlow: { annual: [], quarterly: [], ltm: null },
  };
  const provenance: ProvenanceMap = {};

  for (const kind of STATEMENT_KINDS) {
    const statement: CanonicalStatement = { annual: [], quarterly: [], ltm: null };
    for (const frequency of SERIES_FREQUENCIES) {
      const series = mergeSeries(fragments, kind, frequency);
      statement[frequency] = series.periods;
      Object.assign(provenance, series.provenance);
    }
    const ltm = mergeLtm(fragments, kind);
    statement.ltm = ltm.ltm;
    Object.assign(provenance, ltm.provenance);
    financials[kind] = statement;
  }

  return { financials, provenance };
}
