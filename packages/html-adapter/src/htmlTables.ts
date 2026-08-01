/**
 * Regex-based `<table>` extraction. Deliberately not a full HTML parser (no
 * dependency beyond `@valuation-bot/canonical`/`@valuation-bot/source-adapter`
 * is allowed for this package) - just enough tag/row/cell scanning to turn a
 * published financials page into `ParsedTable[]`. Malformed or unexpected
 * markup degrades to fewer/emptier tables, never a thrown error; callers
 * should treat every field here as best-effort.
 *
 * Known limitation: row/cell extraction scans a table's *entire* content for
 * `<tr>`/`<td>`/`<th>` tags, so a `<table>` nested inside a cell (rare on
 * financial-statement pages) would have its rows folded into the outer
 * table rather than parsed separately.
 */
import { htmlToText, stripNonContentBlocks } from "./htmlText";
import type { ParsedTable, ParsedTableRow, HtmlParseResult } from "./types";

interface RawTableBlock {
  start: number;
  end: number;
  content: string;
}

interface RawCell {
  tag: "td" | "th";
  html: string;
}

/** Finds every outermost `<table>...</table>` block, tracking nesting depth so a nested table's markup stays folded into its parent's content rather than being split out as its own block. */
function findTableBlocks(html: string): RawTableBlock[] {
  const tagRe = /<table\b[^>]*>|<\/table\s*>/gi;
  const blocks: RawTableBlock[] = [];
  const stack: { start: number; innerStart: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const token = match[0];
    if (/^<table/i.test(token)) {
      stack.push({ start: match.index, innerStart: match.index + token.length });
      continue;
    }
    const open = stack.pop();
    if (open && stack.length === 0) {
      blocks.push({
        start: open.start,
        end: match.index + token.length,
        content: html.slice(open.innerStart, match.index),
      });
    }
  }

  return blocks;
}

function extractCells(rowHtml: string): RawCell[] {
  const cellRe = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const cells: RawCell[] = [];
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(rowHtml)) !== null) {
    cells.push({ tag: (match[1] ?? "").toLowerCase() as "td" | "th", html: match[2] ?? "" });
  }
  return cells;
}

function extractRowsHtml(sectionHtml: string): string[] {
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  const rows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(sectionHtml)) !== null) {
    rows.push(match[1] ?? "");
  }
  return rows;
}

/**
 * Splits one table's inner HTML into a header row (if any) and data rows.
 * Prefers an explicit `<thead>`/`<tbody>` split; falls back to treating the
 * first row as a header only when every one of its cells is a `<th>`; falls
 * back further to "no header row" (`headers: []`) rather than guessing wrong.
 */
function parseTableContent(content: string): { headers: string[]; rows: ParsedTableRow[] } {
  const theadMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/i.exec(content);
  const tbodyMatch = /<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/i.exec(content);

  let headerCells: RawCell[] = [];
  let bodyRowsHtml: string[];

  if (theadMatch) {
    const theadRows = extractRowsHtml(theadMatch[1] ?? "");
    headerCells = theadRows.length > 0 ? extractCells(theadRows[0] ?? "") : [];
    bodyRowsHtml = extractRowsHtml(tbodyMatch ? (tbodyMatch[1] ?? "") : content);
  } else {
    const allRows = extractRowsHtml(tbodyMatch ? (tbodyMatch[1] ?? "") : content);
    const firstCells = allRows.length > 0 ? extractCells(allRows[0] ?? "") : [];
    const firstRowIsHeader = firstCells.length > 0 && firstCells.every((cell) => cell.tag === "th");
    if (firstRowIsHeader) {
      headerCells = firstCells;
      bodyRowsHtml = allRows.slice(1);
    } else {
      bodyRowsHtml = allRows;
    }
  }

  // The leading header cell is the corner above the row-label column (blank,
  // or a caption like "Fiscal Year") - drop it so `headers[i]` lines up with
  // each row's `values[i]`, not its `label`.
  const headers = headerCells.length > 1 ? headerCells.slice(1).map((cell) => htmlToText(cell.html)) : [];

  const rows: ParsedTableRow[] = bodyRowsHtml
    .map((rowHtml): ParsedTableRow => {
      const cells = extractCells(rowHtml);
      const [labelCell, ...rest] = cells;
      if (!labelCell) return { label: "", values: [] };
      return {
        label: htmlToText(labelCell.html),
        values: rest.map((cell) => htmlToText(cell.html)),
      };
    })
    .filter((row) => row.label !== "" || row.values.length > 0);

  return { headers, rows };
}

/** Locates the nearest preceding `<h1>`-`<h4>` heading (or, failing that, an element classed "title"/"heading") within `[searchStart, searchEnd)`. */
function findPrecedingHeading(html: string, searchStart: number, searchEnd: number): string | null {
  const windowStart = Math.max(searchStart, searchEnd - 4000);
  const window = html.slice(windowStart, searchEnd);

  const headingRe = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let lastHeading: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(window)) !== null) {
    const text = htmlToText(match[2] ?? "");
    if (text) lastHeading = text;
  }
  if (lastHeading) return lastHeading;

  const classMatch = /<[a-zA-Z][^>]*class="[^"]*\b(?:title|heading)\b[^"]*"[^>]*>([^<]*)</i.exec(window);
  if (classMatch) {
    const text = htmlToText(classMatch[1] ?? "");
    if (text) return text;
  }

  return null;
}

/**
 * Parses every `<table>` out of a raw HTML page into `ParsedTable`s. Never
 * throws: unparseable/empty input just yields an empty `tables` array plus a
 * note explaining why.
 */
export function parseHtmlTables(html: string): HtmlParseResult {
  const cleaned = stripNonContentBlocks(html);
  const blocks = findTableBlocks(cleaned);
  const notes: string[] = [];

  if (blocks.length === 0) {
    notes.push("no <table> elements found in page");
    return { tables: [], notes };
  }

  let searchFloor = 0;
  const tables: ParsedTable[] = blocks.map((block, index) => {
    const captionMatch = /<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/i.exec(block.content);
    const captionText = captionMatch ? htmlToText(captionMatch[1] ?? "") : null;
    const title = captionText ?? findPrecedingHeading(cleaned, searchFloor, block.start);
    searchFloor = block.end;

    const { headers, rows } = parseTableContent(block.content);
    if (rows.length === 0) {
      notes.push(`table ${index}${title ? ` ("${title}")` : ""} had no data rows`);
    }
    return { title, headers, rows };
  });

  return { tables, notes };
}
