/**
 * The Tier 4 HTML `SourceAdapter`: the full-contract wrapper around this
 * package's two lower-level halves - `fetchAndParseFinancials` (fetch the
 * three published statement pages and parse their tables) and
 * `mapHtmlTablesToCanonicalFinancials` (turn those tables into canonical line
 * items with `source=html`, `tier=4` provenance).
 *
 * Scraped HTML is the last-resort source: no authentication, no schema
 * contract with the publisher, and a page layout that can change without
 * notice - so it sits below every vendor-API tier. Two consequences shape this
 * file:
 *   - `isAvailable` needs no API key (unlike Tier 1/2 adapters) - a plain
 *     scraper is always "available"; it just self-disables its individual
 *     fetches when a page can't be reached.
 *   - This source scrapes statement *tables* only; it carries no reliable
 *     company/market meta, so `resolveMeta` returns an empty-but-canonical
 *     fragment with an explanatory note rather than guessing.
 *
 * Per the shared `SourceAdapter` contract, every method NEVER throws:
 * `isAvailable`, `resolveMeta`, and `fetchFinancials` each catch all errors
 * and fall through to a canonical-shaped result (an `AdapterFragment` with a
 * `CanonicalError` note, or the `RateLimited` sentinel), so a failed scrape
 * never blocks the more authoritative tiers above it.
 */
import type { CanonicalMeta } from "@valuation-bot/canonical";
import {
  adapterError,
  createEmptyAdapterFragment,
  rateLimited,
  type AdapterFragment,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";

import { HTML_SOURCE, HTML_TIER } from "./config";
import type { HtmlConfig } from "./config";
import { fetchAndParseFinancials } from "./fetchAndParseFinancials";
import { mapHtmlTablesToCanonicalFinancials } from "./mapToCanonical";

/** `CanonicalMeta` fields this scraper cannot resolve; each gets the same explanatory note code in `resolveMeta`. */
const UNRESOLVABLE_META_FIELDS: (keyof CanonicalMeta)[] = [
  "companyName",
  "exchange",
  "currency",
  "sharesOutstanding",
  "currentPrice",
  "fiscalYearEnd",
];

/** Wraps an unexpected thrown error into a canonical-shaped fragment so the contract's "never throws" guarantee holds even on a bug. */
function unexpectedErrorFragment(ticker: string, phase: string, err: unknown): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  const detail = err instanceof Error ? err.message : String(err);
  fragment.errors.push(
    adapterError(HTML_SOURCE, `HTML ${phase} failed unexpectedly for "${ticker}": ${detail}`, {
      code: "SOURCE_UNAVAILABLE",
    }),
  );
  return fragment;
}

/**
 * Constructs an HTML `SourceAdapter` bound to `config`. This is the last-resort
 * Tier 4 source - no credentials required, so `isAvailable` is effectively
 * always `true`; the real "can I reach this page right now" check can only
 * happen asynchronously and surfaces as a normal fragment/error from
 * `fetchFinancials`, never by flipping `isAvailable`.
 */
export function createHtmlAdapter(config: HtmlConfig = {}): SourceAdapter<HtmlConfig> {
  return {
    name: HTML_SOURCE,
    tier: HTML_TIER,
    /**
     * A plain scraper needs no API key, so it is always available. Wrapped in a
     * guard purely to honour the contract's "synchronous, never throws" rule.
     */
    isAvailable(_cfg: HtmlConfig): boolean {
      try {
        return true;
      } catch {
        return false;
      }
    },
    /**
     * The HTML source scrapes statement tables only and carries no reliable
     * company/market meta, so this returns an empty-but-canonical fragment with
     * one explanatory note per meta field rather than guessing. Never throws.
     */
    async resolveMeta(ticker: string): Promise<ResolveMetaResult> {
      try {
        const fragment = createEmptyAdapterFragment();
        for (const field of UNRESOLVABLE_META_FIELDS) {
          fragment.errors.push(
            adapterError(HTML_SOURCE, `HTML source scrapes statement tables only; ${field} is not available for "${ticker}"`, {
              field,
              code: "META_NOT_AVAILABLE",
            }),
          );
        }
        return fragment;
      } catch (err) {
        return unexpectedErrorFragment(ticker, "resolveMeta", err);
      }
    },
    /**
     * Fetches + parses the three statement pages, then maps whatever tables came
     * back into a canonical fragment. A forced scrape failure (page 404/timeout/
     * no recognizable tables) degrades to an empty-but-canonical fragment with
     * `CanonicalError` notes - never a throw; a 429 returns the shared
     * `RateLimited` sentinel so the orchestrator can move on.
     */
    async fetchFinancials(ticker: string): Promise<FetchFinancialsResult> {
      try {
        const parsed = await fetchAndParseFinancials(ticker, config);
        if ("rateLimited" in parsed) {
          return rateLimited(HTML_SOURCE, parsed.retryAfterMs);
        }

        const mapped = mapHtmlTablesToCanonicalFinancials(parsed.tables);

        const fragment = createEmptyAdapterFragment();
        fragment.financials = mapped.financials;
        fragment.provenance.financials = mapped.provenance;
        // Fetch/parse notes first, then the canonical-mapping notes, in encounter order.
        fragment.errors = [...parsed.errors, ...mapped.errors];
        return fragment;
      } catch (err) {
        return unexpectedErrorFragment(ticker, "fetchFinancials", err);
      }
    },
  };
}
