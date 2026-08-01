/**
 * Per-field merge of the fixed `CanonicalMeta` scalars across an ordered list
 * of source fragments: for each field the first fragment (highest priority
 * first) that supplies a non-null value wins, and that fragment's provenance
 * record for the field is carried over verbatim. Fields no source filled are
 * left null and, when required, reported with a `FIELD_UNFILLED` error note.
 *
 * Pure and deterministic: given the same fragments (and `now`) it always
 * produces the same result, with no I/O.
 */
import {
  type CanonicalError,
  type CanonicalMeta,
  type IsoDateTime,
  type ProvenanceMap,
} from "@valuation-bot/canonical";
import { type AdapterFragment } from "@valuation-bot/source-adapter";

import { FIELD_UNFILLED_CODE, MERGE_SOURCE, META_FIELDS } from "./constants";

export interface MetaMergeResult {
  /** Every `CanonicalMeta` field, filled from the winning source or left null. */
  meta: CanonicalMeta;
  /** Provenance for each filled field, keyed by field name (e.g. "currentPrice"). */
  provenance: ProvenanceMap;
  /** `FIELD_UNFILLED` notes for required fields no source supplied. */
  errors: CanonicalError[];
}

function emptyMeta(): CanonicalMeta {
  return {
    ticker: null,
    companyName: null,
    exchange: null,
    currency: null,
    fiscalYearEnd: null,
    sharesOutstanding: null,
    currentPrice: null,
    fetchTimestamp: null,
  };
}

/**
 * Merges the `meta` half of each fragment. `requiredMetaFields` are the fields
 * that produce a `FIELD_UNFILLED` note when still null after every source has
 * been consulted; `now` is the timestamp stamped on those notes. Note:
 * `fetchTimestamp` participates in the first-source-wins pass here but is not
 * defaulted - the caller decides how to backfill an unfilled assembly time.
 */
export function mergeMeta(
  fragments: readonly AdapterFragment[],
  requiredMetaFields: readonly (keyof CanonicalMeta)[],
  now: IsoDateTime,
): MetaMergeResult {
  const meta = emptyMeta();
  const provenance: ProvenanceMap = {};

  for (const field of META_FIELDS) {
    for (const fragment of fragments) {
      const value = fragment.meta[field];
      // A field is "provided" only when present and non-null; a null (or
      // absent) value lets a lower-priority source fill it instead.
      if (value === undefined || value === null) continue;
      // Cast is confined to this dynamic per-field assignment: `field` is a
      // union of keys so TS can't correlate it with the value's type.
      (meta as unknown as Record<string, unknown>)[field] = value;
      const record = fragment.provenance.meta[field];
      if (record !== undefined) provenance[field] = record;
      break;
    }
  }

  const errors: CanonicalError[] = [];
  for (const field of requiredMetaFields) {
    if (meta[field] === null) {
      errors.push({
        source: MERGE_SOURCE,
        message: `No source provided a value for meta field "${field}".`,
        code: FIELD_UNFILLED_CODE,
        timestamp: now,
        field,
      });
    }
  }

  return { meta, provenance, errors };
}
