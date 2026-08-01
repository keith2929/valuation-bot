/**
 * The merge engine's public entry point: fold an ordered list of per-source
 * `AdapterFragment`s into one assembled `CanonicalFinancialData`. Ordering is
 * priority - the first fragment that supplies a given field wins it.
 *
 * Deterministic and side-effect free for unit testing: the only impurity is
 * the fallback timestamp, and passing `options.now` removes even that.
 */
import {
  type CanonicalError,
  type CanonicalFinancialData,
  type CanonicalMeta,
  type IsoDateTime,
} from "@valuation-bot/canonical";
import { type AdapterFragment } from "@valuation-bot/source-adapter";

import { DEFAULT_REQUIRED_META_FIELDS } from "./constants";
import { mergeFinancials } from "./financials";
import { mergeMeta } from "./meta";

export interface MergeOptions {
  /**
   * ISO timestamp stamped on generated error notes and used as the fallback
   * `meta.fetchTimestamp` when no source supplies one. Defaults to
   * `new Date().toISOString()` (the sole impure step); pass a fixed value to
   * make a merge fully deterministic in tests.
   */
  now?: IsoDateTime;
  /**
   * Meta fields that yield a `FIELD_UNFILLED` error note when no source
   * supplies them. Defaults to every `CanonicalMeta` field except
   * `fetchTimestamp` (which the engine always backfills).
   */
  requiredMetaFields?: readonly (keyof CanonicalMeta)[];
}

/**
 * Merges `fragments` (highest priority first) into a single canonical record:
 * per-field first-source-wins for meta, history-preserving deep merge for the
 * financial statements, per-field provenance carried from each winning source,
 * and all fragments' non-fatal errors concatenated (in order) ahead of any
 * `FIELD_UNFILLED` notes the merge itself raises. Never throws.
 */
export function mergeFragments(
  fragments: readonly AdapterFragment[],
  options: MergeOptions = {},
): CanonicalFinancialData {
  const now = options.now ?? new Date().toISOString();
  const requiredMetaFields = options.requiredMetaFields ?? DEFAULT_REQUIRED_META_FIELDS;

  const meta = mergeMeta(fragments, requiredMetaFields, now);
  // fetchTimestamp records when this record was assembled; if no source
  // provided one, stamp the merge time so it is never left null.
  if (meta.meta.fetchTimestamp === null) meta.meta.fetchTimestamp = now;

  const financials = mergeFinancials(fragments);

  const errors: CanonicalError[] = [];
  for (const fragment of fragments) errors.push(...fragment.errors);
  errors.push(...meta.errors);

  return {
    meta: meta.meta,
    financials: financials.financials,
    provenance: { meta: meta.provenance, financials: financials.provenance },
    errors,
  };
}
