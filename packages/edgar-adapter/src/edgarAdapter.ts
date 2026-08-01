/**
 * The SEC EDGAR (Tier 1) source adapter.
 *
 * EDGAR is the SEC's official, free, US-only filing system. This adapter:
 *   1. resolves a ticker to a CIK via the public `company_tickers.json` map,
 *   2. fetches the XBRL `companyfacts` payload for that CIK, and
 *   3. normalizes us-gaap concepts into the canonical income statement,
 *      balance sheet, and cash flow line items (5-10 annual years plus recent
 *      quarters), preserving each raw value, its units, currency, and
 *      period-end date, and attaching per-field provenance
 *      (source=EDGAR, tier=1, periodEnd, rawUnits, confidence).
 *
 * Per the `SourceAdapter` contract it NEVER throws: every failure path returns
 * a partial `AdapterFragment` with `CanonicalError` notes, or the `RateLimited`
 * sentinel when the SEC throttles us. Missing concepts become error notes, not
 * exceptions - partial results still flow.
 */
import type { CanonicalFinancials, CanonicalMeta, ProvenanceRecord } from "@valuation-bot/canonical";
import {
  adapterError,
  createEmptyAdapterFragment,
  fetchWithRetry,
  rateLimited,
  type AdapterFragment,
  type FetchFinancialsResult,
  type ResolveMetaResult,
  type SourceAdapter,
} from "@valuation-bot/source-adapter";

import {
  buildCikIndex,
  companyFactsUrl,
  lookupCik,
  type CikRecord,
  type CompanyTickersFile,
} from "./cik";
import { createTickerCache, type TickerCache } from "./tickerCache";
import {
  buildStatement,
  deriveFiscalYearEnd,
  deriveReportingCurrency,
  deriveSharesOutstanding,
  type CompanyFacts,
  type EdgarConceptMap,
} from "./companyFacts";
import {
  EDGAR_CONFIDENCE,
  EDGAR_SOURCE,
  EDGAR_TIER,
  edgarHeaders,
  hasUserAgent,
  resolveEdgarConfig,
  type EdgarConfig,
  type ResolvedEdgarConfig,
} from "./config";

/** The three canonical statements, in the order the adapter emits them. */
const STATEMENT_NAMES: (keyof CanonicalFinancials)[] = ["incomeStatement", "balanceSheet", "cashFlow"];

/** Discriminated outcome of a single JSON GET against EDGAR. */
type JsonOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "error"; message: string; status: number | null };

/** Outcome of loading a company's facts: identity + payload, throttled, or a non-fatal error to attach. */
type LoadOutcome =
  | { kind: "ok"; cik: CikRecord; facts: CompanyFacts }
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "error"; message: string; code: string; field: string | null };

async function getJson<T>(url: string, config: ResolvedEdgarConfig): Promise<JsonOutcome<T>> {
  const outcome = await fetchWithRetry(url, { headers: edgarHeaders(config) }, config.http);
  if (outcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: outcome.retryAfterMs };
  }
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message, status: outcome.status };
  }
  try {
    return { kind: "ok", data: JSON.parse(outcome.body) as T };
  } catch (err) {
    return {
      kind: "error",
      message: `failed to parse JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`,
      status: outcome.status,
    };
  }
}

/**
 * Resolves `ticker` to a CIK and loads its companyfacts payload. Shared by
 * `resolveMeta` and `fetchFinancials`; the companyfacts fetch is always
 * fresh, but the ticker -> CIK index is served from `cache` when a live
 * entry exists, so a burst of lookups (or a `resolveMeta` immediately
 * followed by `fetchFinancials` for the same ticker) only pulls the ~1MB
 * `company_tickers.json` mapping once per TTL window instead of once per call.
 */
async function loadCompanyFacts(
  ticker: string,
  config: ResolvedEdgarConfig,
  cache: TickerCache,
): Promise<LoadOutcome> {
  let cikIndex = cache.get();
  if (cikIndex === null) {
    const tickersOutcome = await getJson<CompanyTickersFile>(config.companyTickersUrl, config);
    if (tickersOutcome.kind === "rateLimited") {
      return { kind: "rateLimited", retryAfterMs: tickersOutcome.retryAfterMs };
    }
    if (tickersOutcome.kind === "error") {
      return {
        kind: "error",
        message: `could not load SEC company_tickers mapping: ${tickersOutcome.message}`,
        code: "COMPANY_TICKERS_UNAVAILABLE",
        field: null,
      };
    }
    cikIndex = buildCikIndex(tickersOutcome.data);
    cache.set(cikIndex);
  }

  const cik = lookupCik(cikIndex, ticker);
  if (cik === null) {
    return {
      kind: "error",
      message: `no CIK found for ticker "${ticker}" in SEC company_tickers (EDGAR is US-only)`,
      code: "CIK_NOT_FOUND",
      field: "ticker",
    };
  }

  const factsOutcome = await getJson<CompanyFacts>(companyFactsUrl(config.companyFactsBaseUrl, cik.cik), config);
  if (factsOutcome.kind === "rateLimited") {
    return { kind: "rateLimited", retryAfterMs: factsOutcome.retryAfterMs };
  }
  if (factsOutcome.kind === "error") {
    return {
      kind: "error",
      message: `could not load companyfacts for CIK ${cik.cik} (${ticker}): ${factsOutcome.message}`,
      code: "COMPANY_FACTS_UNAVAILABLE",
      field: null,
    };
  }

  return { kind: "ok", cik, facts: factsOutcome.data };
}

function usGaapOf(facts: CompanyFacts): EdgarConceptMap {
  return facts.facts?.["us-gaap"] ?? {};
}

function deiOf(facts: CompanyFacts): EdgarConceptMap {
  return facts.facts?.dei ?? {};
}

function metaProvenance(fields: Partial<ProvenanceRecord> & Pick<ProvenanceRecord, "asOf">): ProvenanceRecord {
  return {
    source: EDGAR_SOURCE,
    tier: EDGAR_TIER,
    asOf: fields.asOf,
    periodEnd: fields.periodEnd ?? null,
    rawUnits: fields.rawUnits ?? null,
    confidence: fields.confidence ?? EDGAR_CONFIDENCE,
  };
}

function buildMetaFragment(outcome: Extract<LoadOutcome, { kind: "ok" }>): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  const { cik, facts } = outcome;
  const gaap = usGaapOf(facts);
  const dei = deiOf(facts);
  const fetchTimestamp = new Date().toISOString();

  const companyName = typeof facts.entityName === "string" && facts.entityName.length > 0 ? facts.entityName : cik.title;
  const meta: Partial<CanonicalMeta> = {
    ticker: cik.ticker,
    companyName,
    exchange: "US",
    fetchTimestamp,
  };

  fragment.provenance.meta.ticker = metaProvenance({ asOf: fetchTimestamp });
  fragment.provenance.meta.companyName = metaProvenance({ asOf: fetchTimestamp });
  fragment.provenance.meta.exchange = metaProvenance({ asOf: fetchTimestamp });

  const currency = deriveReportingCurrency(gaap);
  if (currency !== null) {
    meta.currency = currency;
    fragment.provenance.meta.currency = metaProvenance({ asOf: fetchTimestamp });
  } else {
    fragment.errors.push(
      adapterError(EDGAR_SOURCE, "could not infer reporting currency from companyfacts", {
        field: "currency",
        code: "MISSING_CURRENCY",
      }),
    );
  }

  const fiscalYearEnd = deriveFiscalYearEnd(gaap);
  if (fiscalYearEnd !== null) {
    meta.fiscalYearEnd = fiscalYearEnd.end;
    fragment.provenance.meta.fiscalYearEnd = metaProvenance({
      asOf: fiscalYearEnd.filed === null ? fetchTimestamp : `${fiscalYearEnd.filed}T00:00:00Z`,
      periodEnd: fiscalYearEnd.end,
    });
  } else {
    fragment.errors.push(
      adapterError(EDGAR_SOURCE, "could not determine fiscal year-end from companyfacts", {
        field: "fiscalYearEnd",
        code: "MISSING_FISCAL_YEAR_END",
      }),
    );
  }

  const shares = deriveSharesOutstanding(dei);
  if (shares !== null) {
    meta.sharesOutstanding = shares.val;
    fragment.provenance.meta.sharesOutstanding = metaProvenance({
      asOf: shares.filed === null ? fetchTimestamp : `${shares.filed}T00:00:00Z`,
      periodEnd: shares.end,
      rawUnits: shares.rawUnitKey,
    });
  } else {
    fragment.errors.push(
      adapterError(EDGAR_SOURCE, "shares outstanding not reported in dei facts", {
        field: "sharesOutstanding",
        code: "MISSING_SHARES_OUTSTANDING",
      }),
    );
  }

  // EDGAR is a filing archive, not a market-data feed: it has no current price.
  fragment.errors.push(
    adapterError(EDGAR_SOURCE, "EDGAR does not provide market prices; currentPrice must come from another source", {
      field: "currentPrice",
      code: "PRICE_NOT_AVAILABLE",
    }),
  );

  fragment.meta = meta;
  return fragment;
}

function buildFinancialsFragment(outcome: Extract<LoadOutcome, { kind: "ok" }>, config: ResolvedEdgarConfig): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  const gaap = usGaapOf(outcome.facts);

  for (const statementName of STATEMENT_NAMES) {
    const { statement, provenance, missingTags } = buildStatement(statementName, gaap, {
      maxAnnualPeriods: config.maxAnnualPeriods,
      maxQuarterlyPeriods: config.maxQuarterlyPeriods,
    });
    fragment.financials[statementName] = statement;
    Object.assign(fragment.provenance.financials, provenance);
    for (const tag of missingTags) {
      fragment.errors.push(
        adapterError(EDGAR_SOURCE, `no us-gaap concept found for ${statementName}.${tag}`, {
          field: `${statementName}.${tag}`,
          code: "MISSING_CONCEPT",
        }),
      );
    }
  }

  return fragment;
}

/** Turns a non-fatal load error into an empty fragment carrying just the error note. */
function errorFragment(error: Extract<LoadOutcome, { kind: "error" }>): AdapterFragment {
  const fragment = createEmptyAdapterFragment();
  fragment.errors.push(
    adapterError(EDGAR_SOURCE, error.message, { code: error.code, field: error.field }),
  );
  return fragment;
}

/**
 * Constructs an EDGAR `SourceAdapter` bound to `config`. The SEC-required
 * User-Agent (and any endpoint/retry overrides) are captured here; the
 * `resolveMeta`/`fetchFinancials` calls the orchestrator makes carry only a
 * ticker, per the contract.
 */
export function createEdgarAdapter(config: EdgarConfig): SourceAdapter<EdgarConfig> {
  const resolved = resolveEdgarConfig(config);
  const tickerCache = createTickerCache(resolved.tickerCacheTtlMs);

  return {
    name: EDGAR_SOURCE,
    tier: EDGAR_TIER,
    isAvailable(cfg: EdgarConfig): boolean {
      return hasUserAgent(cfg);
    },
    async resolveMeta(ticker: string): Promise<ResolveMetaResult> {
      const outcome = await loadCompanyFacts(ticker, resolved, tickerCache);
      if (outcome.kind === "rateLimited") return rateLimited(EDGAR_SOURCE, outcome.retryAfterMs);
      if (outcome.kind === "error") return errorFragment(outcome);
      return buildMetaFragment(outcome);
    },
    async fetchFinancials(ticker: string): Promise<FetchFinancialsResult> {
      const outcome = await loadCompanyFacts(ticker, resolved, tickerCache);
      if (outcome.kind === "rateLimited") return rateLimited(EDGAR_SOURCE, outcome.retryAfterMs);
      if (outcome.kind === "error") return errorFragment(outcome);
      return buildFinancialsFragment(outcome, resolved);
    },
  };
}
