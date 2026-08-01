/**
 * Best-effort parsing of a scraped table's column headers ("FY 2023",
 * "Dec 31, 2023", "Q3 2024") into an `IsoDate` period end. Published pages use
 * whatever header convention the publisher likes, and none of them are
 * guaranteed to state a full date - so this fills in the most defensible
 * fiscal-period-end guess (calendar year/quarter end) when only a year or
 * quarter is given, and returns `null` rather than guessing wildly for
 * anything unrecognized (e.g. "TTM", "Current").
 */
import type { IsoDate } from "@valuation-bot/canonical";

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const QUARTER_END_MONTH: Record<string, number> = { "1": 3, "2": 6, "3": 9, "4": 12 };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number): IsoDate | null {
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  const clampedDay = Math.min(Math.max(day, 1), lastDayOfMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(clampedDay)}`;
}

/** Expands a 2-digit year ("23") to a 4-digit one; 4-digit years pass through unchanged. */
function normalizeYear(yearText: string): number {
  if (yearText.length === 4) return Number(yearText);
  const twoDigit = Number(yearText);
  return twoDigit + (twoDigit >= 70 ? 1900 : 2000);
}

/**
 * Parses one column header into an `IsoDate` period end, or `null` if the
 * header doesn't recognizably encode a period (e.g. "TTM", a blank corner
 * cell). Never throws.
 */
export function parseHtmlPeriodHeader(header: string): IsoDate | null {
  const trimmed = header.trim();
  if (trimmed === "") return null;

  const isoDate = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (isoDate) {
    const [, y, m, d] = isoDate;
    return toIsoDate(Number(y), Number(m), Number(d));
  }

  const monthDayYear = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  if (monthDayYear) {
    const [, monthName, day, year] = monthDayYear;
    const month = MONTH_INDEX[(monthName ?? "").slice(0, 3).toLowerCase()];
    if (month) return toIsoDate(Number(year), month, Number(day));
  }

  const quarter = /^Q([1-4])['\s]*(?:FY)?\s*(\d{4}|\d{2})$/i.exec(trimmed);
  if (quarter) {
    const [, q, year] = quarter;
    const month = QUARTER_END_MONTH[q ?? ""];
    if (month) return toIsoDate(normalizeYear(year ?? ""), month, 31);
  }

  const fiscalYear = /^FY\s*'?(\d{4}|\d{2})$/i.exec(trimmed);
  if (fiscalYear) {
    return toIsoDate(normalizeYear(fiscalYear[1] ?? ""), 12, 31);
  }

  const bareYear = /^(\d{4})$/.exec(trimmed);
  if (bareYear) {
    return toIsoDate(Number(bareYear[1]), 12, 31);
  }

  return null;
}
