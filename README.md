**#valuation-bot**

A modular equity valuation pipeline that extracts financial data from multiple tiers of sources, normalizes them into a single schema, and runs DCF/DDM/comps valuations.

Note: Early prototypes referenced a specific Excel workbook for formula validation, but that workbook is now deprecated. The focus has shifted entirely to the extraction layer and multi-source fallback.

Overview
valuation-bot is a TypeScript monorepo that turns messy, fragmented financial data into a clean, auditable valuation. It pulls from:

Tier 1 (Authoritative & Free): SEC EDGAR (XBRL/HTML)

Tier 2 (Commercial APIs): FMP, Alpha Vantage, Polygon

Tier 3 (Community/Backup): yfinance

Tier 4 (Last Resort): Web scraping (fallback for missing or delisted tickers)

Data flows through a standardized JSON contract, then into an adapter that stitches together fiscal years and derives working capital, and finally into a pure-TS valuation engine. The frontend visualizes the football field and sensitivity grids.

Problem
Financial data is a mess:

Cost: Premium APIs (Bloomberg, Refinitiv) are too expensive for independent analysts.

Rate limits: Free tiers (Alpha Vantage, Polygon) cap requests per minute.

Geographic gaps: EDGAR covers US; SGX (Singapore) data is fragmented across PDFs and portals.

Inconsistent schemas: One API calls revenue "revenue"; another calls it "totalRevenue"; a third embeds it inside a line-item array.

Manually collecting and reconciling this data is error-prone and non-reproducible.

Architecture
text
┌─────────────────────────────────────────────────────────────────┐
│                      EXTRACTION LAYER                          │
│  ┌────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐   │
│  │ EDGAR  │→ │  FMP /   │→ │  yfinance  │→ │ Web Scraping│   │
│  │(Tier 1)│  │Alpha Vant│  │ (Tier 3)   │  │  (Tier 4)   │   │
│  └────────┘  └──────────┘  └────────────┘  └─────────────┘   │
│       │           │               │               │           │
│       └───────────┴───────────────┴───────────────┘           │
│                           ▼                                    │
│                  ┌──────────────────┐                         │
│                  │  Raw Extraction  │                         │
│                  │  Result (JSON)   │                         │
│                  └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ADAPTER (normalization)                      │
│  • Stitch multiple fiscal years into a continuous timeline     │
│  • Map canonical tags (audited figures win over unaudited)    │
│  • Derive working capital from BS changes                     │
│  • Tie-out accounting identity (A = L + E)                    │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           VALUATION ENGINE (pure TS, no I/O)                   │
│  • DCF (mid-year discounting)                                 │
│  • DDM                                                         │
│  • Comps (QUARTILE.EXC stats)                                 │
│  • Sensitivity grids & football field                         │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                REACT + VITE FRONTEND                           │
│  • Company search • Assumptions • Statements • Beta/WACC      │
│  • Valuation output • Football field                          │
└─────────────────────────────────────────────────────────────────┘

Features
Tiered extraction – EDGAR → FMP/Alpha Vantage/Polygon → yfinance → web scraping, with automatic fallback on failure.

Deterministic normalization – Audited filings override unaudited; fiscal-year gaps are stitched cleanly.

Pluggable providers – Swap between local fixtures, live extraction, or precomputed static JSON (for GitHub Pages).

Proven valuation math – Mid-year discounting, Hamada unlevering/relevering, and 200+ golden regression tests.

Singapore-ready – Architecture designed to plug in SGX scrapers (PDF → structured JSON) without touching the valuation engine.

Zero-cost static deploy – Precompute results and serve via GitHub Pages—no server needed.

Technology Stack
Layer	Tech
Monorepo	pnpm workspaces (6 packages)
Language	TypeScript (strict)
Frontend	React 18 + Vite
Testing	Vitest + RTL + jsdom
Build	tsc project references
Data Sources	SEC EDGAR (XBRL), FMP, Alpha Vantage, Polygon, yfinance, Cheerio (scraping)
Deploy	GitHub Actions → GitHub Pages
Requires Node ≥ 18 and pnpm 9.0.0.

Design Decisions
1. Why tiered extraction?
Cost + reliability. EDGAR is free and authoritative but rate-limited and hard to parse. Commercial APIs fill gaps but cost money. yfinance is free but community-maintained. Web scraping is the nuclear option. By cascading, we maximize uptime while minimizing cost—and the user never sees the fallback.

2. Why a strict JSON contract (packages/contract)?
Decoupling. The extraction team (or you, in the future) can rewrite scrapers without ever touching the valuation engine. As long as the ExtractionResult shape holds, the adapter and core won't break. This also makes it trivial to unit-test the math with fixture data.

3. Why derive working capital from balance sheets instead of cash flow?
Consistency. Cash-flow statements often classify working-capital changes differently across accounting standards. The balance-sheet approach (Δ current assets − Δ current liabilities) is universally comparable and ties back to the accounting identity.

4. Why pure-TS core with zero I/O?
Testability and deploy flexibility. The valuation engine can run in a browser, on a server, or inside a GitHub Action—all without mocking fs or fetch. We enforce this with a build-time regression test that rejects any import of Node/Deno globals inside valuation-creator-core.

5. Why mid-year discounting by default?
Finance convention. Cash flows are generated throughout the year, not all on Dec 31. Mid-year discounting gives a more accurate present value, especially for high-growth companies.

Future Improvements
🇸🇬 Singapore Stock Exchange (SGX) – Integrate scrapers for annual reports (PDF → text → structured JSON) to mirror the EDGAR pipeline.

Real-time quotes – Add a live price ticker via Polygon WebSocket for intraday comps.

Portfolio mode – Run valuations for a basket of tickers and export a summary dashboard.

CI/CD daily runs – Automatically pull new filings and rebuild static JSON daily, so the GitHub Pages demo is always fresh.

More metrics – Add ROIC, economic profit, and residual income models.

User-defined forecast – Allow overriding management guidance / consensus estimates directly in the UI.

Getting Started
bash
# Clone
git clone https://github.com/keith2929/valuation-bot.git
cd valuation-bot

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests (core math + adapter)
pnpm test

# Start the frontend dev server
pnpm dev
Open http://localhost:5173 to start valuing companies.
