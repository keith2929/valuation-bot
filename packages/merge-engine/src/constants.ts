/**
 * Shared identifiers and defaults for the merge engine. Kept dependency-light
 * (types only) so every module agrees on the source name, error code, and the
 * canonical field universe without importing runtime code.
 */
import { type CanonicalMeta } from "@valuation-bot/canonical";

/**
 * `source` used on `CanonicalError` / `ProvenanceRecord` values the merge
 * engine itself produces (e.g. a "no source filled this field" note), as
 * opposed to records that came from an actual upstream data source.
 */
export const MERGE_SOURCE = "merge-engine";

/** `CanonicalError.code` for a canonical field that no source in the ordered list supplied a value for. */
export const FIELD_UNFILLED_CODE = "FIELD_UNFILLED";

/** Every `CanonicalMeta` scalar field, in a stable iteration order. */
export const META_FIELDS = [
  "ticker",
  "companyName",
  "exchange",
  "currency",
  "fiscalYearEnd",
  "sharesOutstanding",
  "currentPrice",
  "fetchTimestamp",
] as const satisfies readonly (keyof CanonicalMeta)[];

/**
 * Meta fields that get a `FIELD_UNFILLED` error note when no source supplies
 * them. `fetchTimestamp` is excluded because it records the merge/assembly
 * time and the engine always populates it, so it is never genuinely
 * "unfilled".
 */
export const DEFAULT_REQUIRED_META_FIELDS: readonly (keyof CanonicalMeta)[] = META_FIELDS.filter(
  (field) => field !== "fetchTimestamp",
);
