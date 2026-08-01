# Ingestion Service: Financial Data Pipeline

The ingestion service is a data-resilient financial statement fetcher that pulls from multiple sources in a tiered, best-effort architecture. It exposes a single entry point (`GET /api/financials/:ticker`) that routes tickers to markets, runs eligible adapters, merges their outputs per-field, and returns assembled canonical financial data.

## Architecture Overview

The pipeline has four layers:

1. **Ticker Resolver** (`@valuation-bot/ticker-resolver`): Routes a ticker string to a market descriptor and its eligible source adapters.
2. **Orchestrator** (`@valuation-bot/orchestrator`): Runs adapters in tier order (most-authoritative first), collects fragments, and coordinates merging.
3. **Merge Engine** (`@valuation-bot/merge-engine`): Folds ordered adapter fragments into one canonical record: per-field first-source-wins for metadata, history-preserving merge for statements.
4. **HTTP Server** (`server.js`): Exposes the pipeline via a minimal Node.js HTTP server.

## Source Tiers

Each data source is assigned a tier that determines its priority in the merge. Tiers are enforced globally: the orchestrator always runs adapters in strict ascending tier order before merging.

### Tier 1: Regulatory (Most Authoritative)

**EDGAR (SEC EDGAR)**
- **Scope**: US equity only (annual 10-K, quarterly 10-Q filings).
- **Confidence**: 0.98 (highest—direct SEC filings).
- **Requirements**: `SEC_EDGAR_USER_AGENT` env var (SEC requires a User-Agent identifying your application/email).
- **Limits**: US market only; no international regulatory equivalent wired.
- **Data**: Annual periods (~300–400 days apart), quarterly periods (~70–100 days apart). Most recent ~10 annual + ~8 quarterly capped.

### Tier 2: Vendor APIs (Secondary)

Three vendor APIs share this tier and are ordered by confidence within it (no tie-breaking needed; tier order handles priority).

**FMP (Financial Modeling Prep)**
- **Scope**: Global; ~60 markets (US, EU, Asia, etc.).
- **Confidence**: 0.85.
- **Requirements**: `FMP_API_KEY` env var.
- **Limits**: Rate-limited; check HTTP response + body for 429/"limit reach" signals (both caught and reported as non-fatal errors).
- **Data**: Annual + quarterly via `/financials/*` endpoints; share currency + units reporting.

**Polygon.io**
- **Scope**: Global; US-centric but covers major exchanges.
- **Confidence**: 0.8.
- **Requirements**: `POLYGON_API_KEY` env var.
- **Limits**: Rate-limited; 429 caught and reported.
- **Data**: Annual + quarterly via `/reference/financials` vX endpoint. Per-share units carry currency; units differ from other tiers.

**Alpha Vantage**
- **Scope**: Global; US-centric equity focus.
- **Confidence**: 0.8.
- **Requirements**: `ALPHAVANTAGE_API_KEY` env var.
- **Limits**: Rate-limited; Note/Information fields detect limits (caught and reported).
- **Data**: Annual + quarterly; string-encoded numerics ("None" for missing values) parsed defensively.

### Tier 3: Unofficial (Best-Effort)

**Yfinance (Yahoo Finance Scraper)**
- **Scope**: Global; reverse-engineered Yahoo quoteSummary endpoint, no API key.
- **Confidence**: 0.5 (lowest—undocumented, unofficial).
- **Requirements**: None (enabled by default).
- **Behavior**: Self-disabling; any failure (session unavailable, network error, JSON malformed, ticker not found) returns a partial fragment with a SOURCE_UNAVAILABLE note rather than blocking. Set `YFINANCE_ENABLED=false` to opt out.
- **Limits**: Tier 3 best-effort; not guaranteed to be available. Session fetch (crumb + cookie) is the runtime dependency.
- **Data**: Annual + quarterly; rows carry no currency info.

### Tier 4: Gap-Fill (Last Resort)

**HTML Mapping** (wired into the orchestrator as the final fallthrough)
- **Scope**: Generic HTML table scraper; proof-of-concept for filling gaps.
- **Confidence**: 0.3 (lowest).
- **Behavior**: "True last resort"—only fills fields that are already null in tiers 1–3. Never overwrites non-null values.
- **Data**: Recognized via row-label patterns (e.g., "Total Revenue", "Net Income"); unrecognized rows skipped.

## Per-Field Fallthrough (Merge Engine)

The merge engine operates on a simple rule: **first fragment wins**.

1. **Fragments ordered highest-priority-first**: The orchestrator sorts adapters by tier (ascending), runs each, and appends fragments in tier order.
2. **Per-field merging**:
   - For **metadata** (ticker, exchange, fiscal year end, etc.): The first fragment to supply a non-null value wins; that value and its provenance are carried through.
   - For **financial statements**: Periods are unioned (not intersected) by `periodEnd`, sorted oldest→newest. Within each merged period, each canonical tag is filled from the first fragment with a non-null `value.raw`.
3. **Tier 4 exception** (HTML gap-fill): The HTML adapter's `mapHtmlTablesToCanonicalFinancials()` accepts an optional `existing` object (the result of tiers 1–3) and skips any field already present, implementing true last-resort fallthrough.
4. **Provenance**: Each field carries metadata about which source filled it (source name, tier, confidence, timestamp).

### Example Fallthrough

| Field | Tier 1 (EDGAR) | Tier 2 (FMP) | Tier 3 (Yfinance) | Merged Result |
|-------|---|---|---|---|
| Revenue (2024) | 100M | 105M | 98M | **100M** (EDGAR wins) |
| EPS | null | 5.50 | 5.49 | **5.50** (FMP wins) |
| Tax Rate | null | null | 21% | **21%** (Yfinance wins) |

## Running the Service

### Start the Server

```bash
# Build the orchestrator and its dependencies
pnpm install
pnpm -r build

# Start the server (default port 3001)
node server.js

# Or specify a custom port
PORT=3000 node server.js
```

### Query the API

```bash
# US ticker (routed to US market, all tiers available)
curl http://localhost:3001/api/financials/AAPL

# SGX ticker (routed to SGX market, tiers 2–3 available, no EDGAR)
curl http://localhost:3001/api/financials/0168.SI

# Response: CanonicalFinancialData
{
  "meta": {
    "ticker": "AAPL",
    "exchange": "NASDAQ",
    "companyName": "Apple Inc.",
    "currency": "USD",
    "fiscalYearEnd": "2023-09-30",
    "sharesOutstanding": 15_540_000_000,
    "currentPrice": null,
    "fetchTimestamp": "2026-08-01T12:34:56.000Z"
  },
  "financials": {
    "incomeStatement": {
      "annual": [ { "periodEnd": "2023-09-30", "tags": { ... } } ],
      "quarterly": [ ... ],
      "ltm": null
    },
    "balanceSheet": { ... },
    "cashFlow": { ... }
  },
  "provenance": {
    "meta": { "ticker": { "source": "edgar", "tier": 1, ... }, ... },
    "financials": { ... }
  },
  "errors": []
}
```

The service **never returns a 500 error**. Bad/unknown tickers return 200 with error notes in the `errors` array (e.g., `UNRESOLVED_MARKET`, `NO_ELIGIBLE_SOURCES`). Rate-limited or unavailable adapters also appear as notes, never as failures.

## Configuration

### Environment Variables

Set via `.env` or environment:

```bash
# REQUIRED for Tier 1 (EDGAR)
SEC_EDGAR_USER_AGENT=MyApp/1.0 (contact@example.com)

# REQUIRED for Tier 2 (Vendor APIs)
FMP_API_KEY=your_fmp_key
POLYGON_API_KEY=your_polygon_key
ALPHAVANTAGE_API_KEY=your_alphavantage_key

# OPTIONAL for Tier 3 (Yfinance)
YFINANCE_ENABLED=true  # default
# Set to "false" to disable
YFINANCE_ENABLED=false
```

**Note**: `EDGAR_USER_AGENT` is also honored as a fallback alias for `SEC_EDGAR_USER_AGENT`, but new configs should use the documented name.

### Tier Availability

- **Tier 1 (EDGAR)**: Available iff `SEC_EDGAR_USER_AGENT` (or the `EDGAR_USER_AGENT` alias) is set.
- **Tier 2 (FMP, Polygon, Alpha Vantage)**: Available iff their respective API keys are set.
- **Tier 3 (Yfinance)**: Available by default; opt-out with `YFINANCE_ENABLED=false`.
- **Tier 4 (HTML)**: Wired into the orchestrator as the last-resort adapter; always runs after tiers 1–3 and only fills fields still null.

If a tier is unavailable (missing credentials), it is skipped non-fatally. The service will fetch from available sources and merge their results.

## Adding a New Source Adapter

To integrate a new data source:

1. **Create a new package** in `packages/my-adapter/`:
   - Implement the `SourceAdapter<TConfig>` interface from `@valuation-bot/source-adapter`.
   - Export `createMyAdapter(config: MyConfig): SourceAdapter<MyConfig>`.

2. **Implement three methods**:
   ```typescript
   export interface SourceAdapter<TConfig> {
     name: string;           // e.g., "my-vendor"
     tier: number;           // 1, 2, 3, or 4
     isAvailable(config: TConfig): boolean;
     resolveMeta(ticker: string): Promise<AdapterFragment | RateLimited>;
     fetchFinancials(ticker: string): Promise<AdapterFragment | RateLimited>;
   }
   ```
   - `isAvailable`: Check if config is valid (e.g., API key present).
   - `resolveMeta`: Return metadata (company name, exchange, fiscal year end, shares outstanding) or a partial fragment with error notes.
   - `fetchFinancials`: Return income statement, balance sheet, cash flow statements or a partial fragment with error notes.
   - **Never throw**. Return a fragment with CanonicalError notes instead.
   - Handle rate limiting: return the `RateLimited` sentinel if rate-limited.

3. **Register in the orchestrator** (`packages/orchestrator/src/registry.ts`):
   ```typescript
   import { createMyAdapter, type MyConfig } from "@valuation-bot/my-adapter";
   
   export interface OrchestratorConfig {
     my?: MyConfig;
     // ... other sources
   }
   
   export function orchestratorConfigFromEnv(
     env: Record<string, string | undefined> = process.env,
   ): OrchestratorConfig {
     const config: OrchestratorConfig = {};
     if (env.MY_API_KEY) config.my = { apiKey: env.MY_API_KEY };
     return config;
   }
   
   export function createDefaultAdapters(config: OrchestratorConfig = {}): AdapterRegistration[] {
     const my: MyConfig = config.my ?? { apiKey: "" };
     return [
       // ... other adapters
       { adapter: createMyAdapter(my), config: my },
     ];
   }
   ```

4. **Wire into market descriptors** (`packages/orchestrator/src/descriptors.ts`):
   ```typescript
   export const US_ADAPTER_ORDER = ["edgar", "fmp", "my-vendor", ...];
   export const SGX_ADAPTER_ORDER = ["fmp", "my-vendor", ...];
   ```
   - List adapters in descending priority (tier order, with ties broken by sequence).

5. **Update `.env.example`**:
   ```bash
   # My Vendor API key - Tier N source
   MY_API_KEY=your_key_here
   ```

6. **No change to the canonical shape**: The `CanonicalFinancialData` interface is fixed. All adapters map their data into the same tags (revenue, netIncome, etc.); new sources do not require schema changes.

## Adding a New Market

To support a new exchange or market:

1. **Create or extend a market descriptor** in `@valuation-bot/ticker-resolver`:
   ```typescript
   export const MY_MARKET: MarketDescriptor = {
     id: "my-market",
     name: "My Exchange",
     exchange: "MYE",
     isoCountryCode: "XX",
     normalizeTickerFn: (ticker: string) => ticker.toUpperCase(),
     matchers: [
       { kind: "suffix", pattern: ".MY" },      // e.g., "MYCO.MY"
       { kind: "prefix", pattern: "MY/" },      // e.g., "MY/MYCO"
     ],
     sourceOrder: ["fmp", "alphavantage"],      // adapters available for this market
   };
   ```

2. **Update the resolver's descriptor list** (in the orchestrator's `descriptors.ts`):
   ```typescript
   export const ORCHESTRATOR_MARKET_DESCRIPTORS: MarketDescriptor[] = [
     { ...MY_MARKET, sourceOrder: ["fmp", "alphavantage"] },
     { ...SGX_MARKET, sourceOrder: [...SGX_ADAPTER_ORDER] },
     { ...US_MARKET, sourceOrder: [...US_ADAPTER_ORDER] },
   ];
   ```
   - Order descriptors by specificity: most-specific first (so `.MY` suffix is matched before a bare `MYCO` is guessed as US).

3. **No change to the canonical shape**: Market-specific metadata (exchange code, country, currency) flow through the same `CanonicalMeta` contract. The orchestrator does not need schema changes to support new markets.

## Known Limits

### US-First Bias
The resolver defaults to the US market for bare tickers (e.g., `AAPL` → NASDAQ). Explicit suffixes (`.SI`, `/SGX`) or configured markets override this. SGX market is listed first in the descriptor array, so `.SI` tickers are never mistaken for US symbols.

### EDGAR US-Only
EDGAR (Tier 1, highest confidence) covers US equities only. International tickers skip EDGAR and fall back to Tier 2 vendors.

### Tier 4 HTML Scraping Is Now Wired
`createHtmlAdapter()` is registered in the orchestrator's default adapter list and appended as the final entry in both `US_ADAPTER_ORDER` and `SGX_ADAPTER_ORDER`. It now runs automatically as the last-resort fallthrough of `fetchFinancials()` — filling only fields still null after tiers 1–3 — rather than being available for custom/manual use only.

### Tier 3–4 Best-Effort
- **Yfinance (Tier 3)**: Unofficial, undocumented endpoint. May become unavailable without notice. Self-disables gracefully if the endpoint fails.
- **HTML (Tier 4)**: Unofficial, generic table scraper. Wired into `fetchFinancials()` as the final fallthrough after tiers 1–3; only fills fields still null, never overwrites higher-tier data.

### Rate Limiting
Tier 2 vendors implement rate limiting and return a `RateLimited` sentinel when throttled. The orchestrator skips the adapter and logs the error, allowing other sources to fill the gaps. Retry-After values are included in error notes if provided.

### Currency & Units
Vendor APIs report financial data in different scales:
- EDGAR & FMP: Units = "ones" (absolute values).
- Polygon: Per-share units carry currency; may differ from other tiers.
- Yfinance: Currency info omitted.
- HTML: Currency assumed null (scraped tables rarely state their scale).

The canonical merge carries unit provenance so consumers can detect these differences if needed.

## Robustness Guarantees

1. **Never throws**: `fetchFinancials()` is wrapped in comprehensive error handling. Unresolved markets, unavailable adapters, rate-limiting, and even adapter bugs are captured as `CanonicalError` notes in the response, never as HTTP 500s.

2. **Partial results**: If only one tier is available, you get that tier's data. If all tiers fail, you get an empty record with error notes explaining why.

3. **Deterministic merge**: Given the same set of fragments in the same order, the merge is deterministic. Timestamp is the only source of non-determinism; pass `now` to tests for full determinism.

4. **Per-tier redundancy**: Each tier can be disabled independently (missing credentials or explicit disable). Losing one tier degrades gracefully to the next; you don't need all tiers to work.

## Testing

The orchestrator's `fetchFinancials()` accepts an options parameter for testing:

```typescript
import { fetchFinancials, ORCHESTRATOR_MARKET_DESCRIPTORS } from "@valuation-bot/orchestrator";

// Fake adapters for testing
const fakeEdgar: SourceAdapter = { /* ... */ };
const fakeYfinance: SourceAdapter = { /* ... */ };

const result = await fetchFinancials("TEST", {
  adapters: [
    { adapter: fakeEdgar, config: {} },
    { adapter: fakeYfinance, config: {} },
  ],
  now: "2026-08-01T12:00:00.000Z", // Fixed timestamp for determinism
});
```

Test utilities are in each adapter's `__tests__/` directory (mock configs, fixture data, expected fragments).

## Debugging

When `fetchFinancials()` returns unexpected results:

1. **Check the `errors` array**: Each adapter that failed or was skipped logs a non-fatal error with a code (e.g., `SOURCE_UNAVAILABLE`, `UNRESOLVED_MARKET`, `FIELD_UNFILLED`).

2. **Inspect `provenance`**: Each field carries source, tier, confidence, and timestamp. Compare across sources to see which wins the merge.

3. **Verify env vars**: Missing API keys silently disable tiers (they report `isAvailable === false`). Check `.env` or `process.env` to confirm all desired tiers are configured.

4. **Reproduce with fake adapters**: In tests, inject known fragments to isolate merge logic from network/adapter issues.

5. **Check market routing**: An `UNRESOLVED_MARKET` error means the ticker was not matched to any market descriptor. Review descriptor matchers and order.
