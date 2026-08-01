// Minimal Node HTTP server exposing the ingestion pipeline (@valuation-bot/orchestrator)
// so the front end can do "type a ticker -> fetch". Plain `http`, no framework.
//
// pnpm workspace packages don't resolve via `require("@valuation-bot/orchestrator")`
// from the repo root on this vboxsf checkout (symlinks are disabled - see
// .npmrc `symlink=false`), so the orchestrator's build output is required directly
// by relative path, same workaround used elsewhere in this repo.
const http = require("http");
const { fetchFinancials, orchestratorConfigFromEnv } = require("./packages/orchestrator/dist/index.js");

const PORT = process.env.PORT || 3001;

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const financialsMatch = req.method === "GET" && url.pathname.match(/^\/api\/financials\/([^/]+)\/?$/);

  if (financialsMatch) {
    const ticker = decodeURIComponent(financialsMatch[1]);
    // fetchFinancials never throws - bad/unknown tickers come back as a
    // partial canonical object with error notes (e.g. UNRESOLVED_MARKET),
    // never a 500.
    fetchFinancials(ticker, { config: orchestratorConfigFromEnv() })
      .then((result) => sendJson(res, 200, result))
      .catch((error) => {
        // Defensive only: the orchestrator's contract is "never throw".
        sendJson(res, 200, {
          meta: { ticker, companyName: null, exchange: null, currency: null, fiscalYearEnd: null, sharesOutstanding: null, currentPrice: null, fetchTimestamp: new Date().toISOString() },
          financials: { incomeStatement: { annual: [], quarterly: [], ltm: null }, balanceSheet: { annual: [], quarterly: [], ltm: null }, cashFlow: { annual: [], quarterly: [], ltm: null } },
          provenance: { meta: {}, financials: {} },
          errors: [
            {
              source: "server",
              message: `Unexpected error fetching "${ticker}": ${error instanceof Error ? error.message : String(error)}`,
              code: "SERVER_ERROR",
              timestamp: new Date().toISOString(),
              field: null,
            },
          ],
        });
      });
    return;
  }

  sendJson(res, 404, { error: `Not found: ${req.method} ${url.pathname}` });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Ingestion server listening on http://localhost:${PORT}`);
    console.log(`  GET /api/financials/:ticker`);
  });
}

module.exports = { server };
