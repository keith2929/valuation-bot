/**
 * Small, dependency-free HTML text helpers: decoding entities and stripping
 * markup down to plain text. Deliberately not a full HTML parser - published
 * financial-statement pages only need "turn this cell's inner markup into a
 * clean string", not a DOM.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  minus: "−",
};

/** Decodes numeric (`&#39;`, `&#x27;`) and the common named HTML entities used in financial tables. Unknown entities are left as-is. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** Removes all HTML tags, converting `<br>`/`<br/>` to a space so cell content that spans lines doesn't glue together. */
export function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "");
}

/** Collapses runs of whitespace (including `&nbsp;` once decoded) into a single space and trims the ends. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Full pipeline for turning one cell/heading's inner HTML into clean display text. */
export function htmlToText(html: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripTags(html)));
}

/** Strips `<script>`, `<style>`, and HTML comment blocks, which otherwise pollute tag/heading scans (e.g. inline JSON containing the literal word "table"). */
export function stripNonContentBlocks(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}
