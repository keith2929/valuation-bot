/**
 * Best-effort numeric parsing for scraped table cells. Published pages print
 * numbers with thousands separators, parenthesized negatives, currency
 * symbols, and occasional magnitude suffixes ("1.2B") - none of which a plain
 * `Number()` call handles. Cells that clearly carry no numeric value ("-",
 * "N/A", empty) parse to `null` rather than `0`, so a blank cell is never
 * mistaken for a reported zero.
 */

const BLANK_CELL_RE = /^(-|—|–|n\/?a)?$/i;

const MAGNITUDE_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
};

const NUMERIC_CELL_RE = /^(\d+(?:\.\d+)?)\s*([kmbtKMBT])?%?$/;

/**
 * Parses one table cell's text into a number, or `null` if it has no
 * recognizable numeric content. Never throws.
 */
export function parseHtmlNumericCell(text: string): number | null {
  const trimmed = text.trim();
  if (BLANK_CELL_RE.test(trimmed)) return null;

  let working = trimmed.replace(/[$£€]/g, "").replace(/−/g, "-").trim();

  let negative = false;
  if (working.startsWith("(") && working.endsWith(")")) {
    negative = true;
    working = working.slice(1, -1).trim();
  }
  if (working.startsWith("-")) {
    negative = true;
    working = working.slice(1).trim();
  } else if (working.startsWith("+")) {
    working = working.slice(1).trim();
  }

  working = working.replace(/,/g, "");

  const match = NUMERIC_CELL_RE.exec(working);
  if (!match) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? (MAGNITUDE_MULTIPLIER[suffix] ?? 1) : 1;
  const magnitude = base * multiplier;

  return negative ? -magnitude : magnitude;
}
