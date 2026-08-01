import { describe, expect, it } from "vitest";

import { collapseWhitespace, decodeHtmlEntities, htmlToText, stripNonContentBlocks, stripTags } from "../src/htmlText";

describe("decodeHtmlEntities", () => {
  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("Cash &amp; Equivalents")).toBe("Cash & Equivalents");
    expect(decodeHtmlEntities("&lt;div&gt;")).toBe("<div>");
    expect(decodeHtmlEntities("R&amp;D")).toBe("R&D");
  });

  it("decodes numeric decimal and hex entities", () => {
    expect(decodeHtmlEntities("&#39;s")).toBe("'s");
    expect(decodeHtmlEntities("&#x27;s")).toBe("'s");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeHtmlEntities("&notreal;")).toBe("&notreal;");
  });
});

describe("stripTags", () => {
  it("removes tags and turns <br> into a space", () => {
    expect(stripTags("<span>Total<br/>Assets</span>")).toBe("Total Assets");
  });
});

describe("collapseWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(collapseWhitespace("  Total   Assets \n")).toBe("Total Assets");
  });
});

describe("htmlToText", () => {
  it("runs the full pipeline: strip tags, decode entities, collapse whitespace", () => {
    expect(htmlToText("  <b>Cash &amp; Equivalents</b>  ")).toBe("Cash & Equivalents");
  });
});

describe("stripNonContentBlocks", () => {
  it("removes script, style, and comment blocks", () => {
    const html = "<script>var table = 1;</script><style>.x{}</style><!-- a comment --><p>keep me</p>";
    expect(stripNonContentBlocks(html)).toBe("<p>keep me</p>");
  });
});
