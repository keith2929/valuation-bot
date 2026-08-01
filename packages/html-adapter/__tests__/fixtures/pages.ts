/** Small, hand-built HTML snippets standing in for real stockanalysis.com/Yahoo-style pages, exercising the layout quirks the parser must survive. */

/** A well-formed income statement page: `<thead>`/`<tbody>`, a heading before the table, and a `<script>` block that must not confuse table scanning. */
export const INCOME_STATEMENT_PAGE = `
<html>
<head><script>var config = { table: "not-a-real-table" };</script></head>
<body>
  <div class="page">
    <h2 class="text-xl font-bold">Income Statement</h2>
    <table>
      <thead>
        <tr><th></th><th>FY 2022</th><th>FY 2023</th></tr>
      </thead>
      <tbody>
        <tr><td>Revenue</td><td>394,328</td><td>383,285</td></tr>
        <tr><td>Cost of Revenue</td><td>223,546</td><td>214,137</td></tr>
        <tr><td>Gross Profit</td><td>170,782</td><td>169,148</td></tr>
        <tr><td>Net Income</td><td>99,803</td><td>96,995</td></tr>
      </tbody>
    </table>
  </div>
</body>
</html>
`;

/** A balance sheet page with no <thead>/<tbody> at all (first <tr> is all <th>), an empty spacer row, and HTML entities in cell text. */
export const BALANCE_SHEET_PAGE_NO_THEAD = `
<html>
<body>
  <h3>Balance Sheet</h3>
  <table>
    <tr><th>Fiscal Year</th><th>FY 2022</th><th>FY 2023</th></tr>
    <tr><td>Cash &amp; Equivalents</td><td>23,646</td><td>29,965</td></tr>
    <tr><td></td></tr>
    <tr><td>Total Assets</td><td>352,755</td><td>352,583</td></tr>
    <tr><td>Total Liabilities</td><td>302,083</td><td>290,437</td></tr>
  </table>
</body>
</html>
`;

/** A cash flow page whose table has been renamed to something that doesn't match the title keyword list, so classification must fall back to row-label signatures. */
export const CASH_FLOW_PAGE_RENAMED_TITLE = `
<html>
<body>
  <h2>Money Movements</h2>
  <table>
    <thead>
      <tr><th></th><th>FY 2022</th><th>FY 2023</th></tr>
    </thead>
    <tbody>
      <tr><td>Operating Cash Flow</td><td>122,151</td><td>110,543</td></tr>
      <tr><td>Capital Expenditures</td><td>(10,708)</td><td>(10,959)</td></tr>
      <tr><td>Free Cash Flow</td><td>111,443</td><td>99,584</td></tr>
    </tbody>
  </table>
</body>
</html>
`;

/** A page with no <table> elements at all - e.g. a 404 or a placeholder page. */
export const PAGE_WITH_NO_TABLES = `<html><body><p>No data available for this ticker.</p></body></html>`;

/** A page with two tables: an unrelated "Key Statistics" table plus the real income statement, exercising multi-table classification on a single page. */
export const PAGE_WITH_MULTIPLE_TABLES = `
<html>
<body>
  <h3>Key Statistics</h3>
  <table>
    <tbody>
      <tr><td>Market Cap</td><td>3,000,000</td></tr>
      <tr><td>P/E Ratio</td><td>28.5</td></tr>
    </tbody>
  </table>
  <h3>Income Statement</h3>
  <table>
    <thead>
      <tr><th></th><th>FY 2023</th></tr>
    </thead>
    <tbody>
      <tr><td>Revenue</td><td>383,285</td></tr>
      <tr><td>Net Income</td><td>96,995</td></tr>
    </tbody>
  </table>
</body>
</html>
`;
