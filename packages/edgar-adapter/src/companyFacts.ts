/**
 * Normalization of a parsed SEC companyfacts payload into the canonical
 * statement/period/line-item shape, with per-field provenance.
 *
 * Everything here is pure (payload in, canonical fragment out) so it can be
 * exhaustively tested against a fixed companyfacts fixture without any
 * network. The adapter (`edgarAdapter.ts`) is the only part that does I/O.
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
  type ReportedUnits,
} from "@valuation-bot/canonical";

import { EDGAR_CONFIDENCE, EDGAR_SOURCE, EDGAR_TIER } from "./config";
import {
  CONCEPT_MAP,
  parseUnitKey,
  pickUnitKey,
  type ConceptDef,
  type StatementDef,
} from "./concepts";

/** One raw datum inside a companyfacts fact node's units array. Every field is optional as sourced. */
export interface EdgarFactEntry {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

/** A single us-gaap/dei concept: a label plus its values grouped by units key. */
export interface EdgarFactNode {
  label?: string;
  description?: string;
  units?: Record<string, EdgarFactEntry[] | undefined>;
}

/** All concepts under one taxonomy (us-gaap or dei). */
export type EdgarConceptMap = Record<string, EdgarFactNode | undefined>;

/** The top-level companyfacts payload. */
export interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: EdgarConceptMap;
    dei?: EdgarConceptMap;
    [taxonomy: string]: EdgarConceptMap | undefined;
  };
}

/** A validated fact entry (end + numeric value guaranteed present), with the fields normalization cares about. */
interface NormalizedEntry {
  end: string;
  val: number;
  start: string | null;
  form: string;
  filed: string | null;
}

/** Bounds (in days) for treating a duration fact as a full fiscal year. Comparatives in 10-Ks fall in this window. */
const ANNUAL_MIN_DAYS = 300;
const ANNUAL_MAX_DAYS = 400;

/** Bounds (in days) for treating a duration fact as a single quarter (excludes YTD 6-/9-month figures in 10-Qs). */
const QUARTER_MIN_DAYS = 70;
const QUARTER_MAX_DAYS = 100;

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT"]);
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A", "10-QT"]);

function toNormalizedEntry(entry: EdgarFactEntry): NormalizedEntry | null {
  if (typeof entry.end !== "string" || typeof entry.val !== "number" || !Number.isFinite(entry.val)) {
    return null;
  }
  return {
    end: entry.end,
    val: entry.val,
    start: typeof entry.start === "string" ? entry.start : null,
    form: typeof entry.form === "string" ? entry.form : "",
    filed: typeof entry.filed === "string" ? entry.filed : null,
  };
}

function daysBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 86_400_000;
}

function isAnnualEntry(entry: NormalizedEntry, isDuration: boolean): boolean {
  if (!ANNUAL_FORMS.has(entry.form)) return false;
  if (!isDuration) return true;
  if (entry.start === null) return false;
  const days = daysBetween(entry.start, entry.end);
  return days >= ANNUAL_MIN_DAYS && days <= ANNUAL_MAX_DAYS;
}

function isQuarterlyEntry(entry: NormalizedEntry, isDuration: boolean): boolean {
  if (!QUARTERLY_FORMS.has(entry.form)) return false;
  if (!isDuration) return true;
  if (entry.start === null) return false;
  const days = daysBetween(entry.start, entry.end);
  return days >= QUARTER_MIN_DAYS && days <= QUARTER_MAX_DAYS;
}

/**
 * Collapses entries to one per period-end, keeping the most-recently-filed
 * value so restatements win over the original filing for the same period.
 */
function pickPerPeriod(entries: NormalizedEntry[]): Map<string, NormalizedEntry> {
  const byEnd = new Map<string, NormalizedEntry>();
  for (const entry of entries) {
    const existing = byEnd.get(entry.end);
    if (!existing || (entry.filed ?? "") > (existing.filed ?? "")) {
      byEnd.set(entry.end, entry);
    }
  }
  return byEnd;
}

/** Deduplicates, sorts oldest-first, and keeps the most-recent `limit` period-ends. */
function selectRecentEnds(ends: Iterable<string>, limit: number): string[] {
  const sorted = [...new Set(ends)].sort();
  return limit >= sorted.length ? sorted : sorted.slice(sorted.length - limit);
}

/** ISO date "2013-10-30" -> ISO date-time "2013-10-30T00:00:00Z"; null passes through. */
function toIsoDateTime(isoDate: string | null): string | null {
  return isoDate === null ? null : `${isoDate}T00:00:00Z`;
}

/** Per-tag data resolved from a fact node: which us-gaap concept supplied it, its unit interpretation, and its periods. */
interface ResolvedConcept {
  tag: string;
  label: string;
  units: ReportedUnits;
  currency: CurrencyCode | null;
  rawUnitKey: string;
  annual: Map<string, NormalizedEntry>;
  quarterly: Map<string, NormalizedEntry>;
}

/** Result of normalizing one statement: the canonical statement, its provenance, and any concepts not found. */
export interface StatementResult {
  statement: CanonicalStatement;
  provenance: ProvenanceMap;
  /** Canonical tags with no matching us-gaap concept in the payload. */
  missingTags: string[];
}

function provenanceFor(entry: NormalizedEntry, rawUnitKey: string): ProvenanceRecord {
  return {
    source: EDGAR_SOURCE,
    tier: EDGAR_TIER,
    asOf: toIsoDateTime(entry.filed),
    periodEnd: entry.end,
    rawUnits: rawUnitKey,
    confidence: EDGAR_CONFIDENCE,
  };
}

/**
 * Normalizes one of the three core statements from a us-gaap concept map into
 * the canonical `annual`/`quarterly` period arrays (oldest -> newest), with a
 * provenance record per emitted data point keyed by `provenanceKey`.
 */
export function buildStatement(
  statementName: keyof CanonicalFinancials,
  gaap: EdgarConceptMap,
  options: { maxAnnualPeriods: number; maxQuarterlyPeriods: number },
): StatementResult {
  const def: StatementDef = CONCEPT_MAP[statementName];
  const resolved: ResolvedConcept[] = [];
  const missingTags: string[] = [];

  for (const conceptDef of def.concepts) {
    const node = resolveConcept(gaap, conceptDef, def.duration);
    if (node === null) {
      missingTags.push(conceptDef.tag);
    } else {
      resolved.push(node);
    }
  }

  const annualEnds = selectRecentEnds(
    resolved.flatMap((concept) => [...concept.annual.keys()]),
    options.maxAnnualPeriods,
  );
  const quarterlyEnds = selectRecentEnds(
    resolved.flatMap((concept) => [...concept.quarterly.keys()]),
    options.maxQuarterlyPeriods,
  );

  const provenance: ProvenanceMap = {};

  const buildPeriods = (frequency: PeriodFrequency, ends: string[]): CanonicalStatementPeriod[] =>
    ends.map((end, periodIndex) => {
      const period: CanonicalLineItem[] = [];
      for (const concept of resolved) {
        const source = frequency === "annual" ? concept.annual : concept.quarterly;
        const entry = source.get(end);
        if (!entry) continue;
        period.push({
          tag: concept.tag,
          label: concept.label,
          value: { raw: entry.val, units: concept.units, currency: concept.currency, periodEnd: end },
        });
        provenance[provenanceKey(statementName, frequency, periodIndex, concept.tag)] = provenanceFor(
          entry,
          concept.rawUnitKey,
        );
      }
      return period;
    });

  const statement: CanonicalStatement = {
    annual: buildPeriods("annual", annualEnds),
    quarterly: buildPeriods("quarterly", quarterlyEnds),
    ltm: null,
  };

  return { statement, provenance, missingTags };
}

/**
 * Finds the first candidate us-gaap concept present in `gaap` with a readable
 * units key, and buckets its values into annual/quarterly periods. `isDuration`
 * comes from the statement (income/cash flow are spans; balance-sheet concepts
 * are instants), and drives how periods are recognized.
 */
function resolveConcept(gaap: EdgarConceptMap, def: ConceptDef, isDuration: boolean): ResolvedConcept | null {
  for (const conceptName of def.concepts) {
    const node = gaap[conceptName];
    if (!node || !node.units) continue;
    const unitKey = pickUnitKey(Object.keys(node.units), def.kind);
    if (unitKey === null) continue;
    const rawEntries = node.units[unitKey];
    if (!rawEntries || rawEntries.length === 0) continue;

    const normalized = rawEntries
      .map(toNormalizedEntry)
      .filter((entry): entry is NormalizedEntry => entry !== null);
    const { units, currency } = parseUnitKey(unitKey);
    return {
      tag: def.tag,
      label: typeof node.label === "string" && node.label.length > 0 ? node.label : def.label,
      units,
      currency,
      rawUnitKey: unitKey,
      annual: pickPerPeriod(normalized.filter((entry) => isAnnualEntry(entry, isDuration))),
      quarterly: pickPerPeriod(normalized.filter((entry) => isQuarterlyEntry(entry, isDuration))),
    };
  }
  return null;
}

/** Reporting-currency candidates, most-representative first, used to infer `CanonicalMeta.currency`. */
const CURRENCY_HINT_CONCEPTS = [
  "Assets",
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "NetIncomeLoss",
  "StockholdersEquity",
];

/** Infers the statements' reporting currency from the first monetary concept that carries a currency units key. */
export function deriveReportingCurrency(gaap: EdgarConceptMap): CurrencyCode | null {
  for (const conceptName of CURRENCY_HINT_CONCEPTS) {
    const node = gaap[conceptName];
    if (!node || !node.units) continue;
    const currencyKey = Object.keys(node.units).find((key) => /^[A-Z]{3}$/.test(key));
    if (currencyKey) return currencyKey;
  }
  return null;
}

/** Picks the most recent entry (by period-end, then filed date) from a set. */
function latestEntry(entries: NormalizedEntry[]): NormalizedEntry | null {
  let best: NormalizedEntry | null = null;
  for (const entry of entries) {
    if (
      best === null ||
      entry.end > best.end ||
      (entry.end === best.end && (entry.filed ?? "") > (best.filed ?? ""))
    ) {
      best = entry;
    }
  }
  return best;
}

/** The most recent annual (10-K) balance-sheet date -> `CanonicalMeta.fiscalYearEnd`, with its filing date. */
export function deriveFiscalYearEnd(gaap: EdgarConceptMap): { end: string; filed: string | null } | null {
  for (const conceptName of ["Assets", "Liabilities", "StockholdersEquity"]) {
    const node = gaap[conceptName];
    if (!node || !node.units) continue;
    const currencyKey = Object.keys(node.units).find((key) => /^[A-Z]{3}$/.test(key));
    if (!currencyKey) continue;
    const entries = (node.units[currencyKey] ?? [])
      .map(toNormalizedEntry)
      .filter((entry): entry is NormalizedEntry => entry !== null && isAnnualEntry(entry, /*isDuration*/ false));
    const latest = latestEntry(entries);
    if (latest) return { end: latest.end, filed: latest.filed };
  }
  return null;
}

/** Most recently reported common shares outstanding from dei, for `CanonicalMeta.sharesOutstanding`. */
export function deriveSharesOutstanding(
  dei: EdgarConceptMap,
): { val: number; end: string; filed: string | null; rawUnitKey: string } | null {
  const node = dei["EntityCommonStockSharesOutstanding"];
  if (!node || !node.units) return null;
  const unitKey = pickUnitKey(Object.keys(node.units), "shares");
  if (unitKey === null) return null;
  const entries = (node.units[unitKey] ?? [])
    .map(toNormalizedEntry)
    .filter((entry): entry is NormalizedEntry => entry !== null);
  const latest = latestEntry(entries);
  return latest ? { val: latest.val, end: latest.end, filed: latest.filed, rawUnitKey: unitKey } : null;
}
