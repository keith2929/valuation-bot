/**
 * The adapter registry the orchestration loop runs against.
 *
 * A `SourceAdapter.isAvailable(config)` pre-flight is checked against the very
 * config the adapter was constructed with, so an adapter and its config must
 * travel together - that pairing is an `AdapterRegistration`. `createDefaultAdapters`
 * builds one registration per known source from a single `OrchestratorConfig`;
 * sources whose credentials are absent still get registered but simply report
 * `isAvailable === false` and are skipped by the loop.
 */
import type { AdapterConfig, SourceAdapter } from "@valuation-bot/source-adapter";

import { createEdgarAdapter, type EdgarConfig } from "@valuation-bot/edgar-adapter";
import { createFmpAdapter, type FmpConfig } from "@valuation-bot/fmp-adapter";
import { createAlphaVantageAdapter, type AlphaVantageConfig } from "@valuation-bot/alphavantage-adapter";
import { createPolygonAdapter, type PolygonConfig } from "@valuation-bot/polygon-adapter";
import { createYfinanceAdapter, type YfinanceConfig } from "@valuation-bot/yfinance-adapter";
import { createHtmlAdapter, type HtmlConfig } from "@valuation-bot/html-adapter";

/**
 * One source adapter paired with the config it was constructed against. The
 * loop calls `adapter.isAvailable(config)` before running the adapter, so the
 * config here must be the same object the adapter closed over.
 */
export interface AdapterRegistration<TConfig extends AdapterConfig = AdapterConfig> {
  adapter: SourceAdapter<TConfig>;
  config: TConfig;
}

/** Per-source configuration for the default registry. Every source is optional; omit one to leave it unavailable. */
export interface OrchestratorConfig {
  edgar?: EdgarConfig;
  fmp?: FmpConfig;
  alphavantage?: AlphaVantageConfig;
  polygon?: PolygonConfig;
  yfinance?: YfinanceConfig;
  html?: HtmlConfig;
}

/**
 * Reads an `OrchestratorConfig` from `process.env`, so a real deployment can
 * wire credentials without hard-coding them. Unset variables leave the
 * corresponding source unavailable (its `isAvailable` returns false). Never
 * throws; a missing `process` (non-Node runtime) yields an all-empty config.
 *
 * EDGAR's user-agent is read from the documented `SEC_EDGAR_USER_AGENT`;
 * `EDGAR_USER_AGENT` is honored only as a fallback alias for older configs.
 */
export function orchestratorConfigFromEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): OrchestratorConfig {
  const config: OrchestratorConfig = {};
  const edgarUserAgent = env.SEC_EDGAR_USER_AGENT || env.EDGAR_USER_AGENT;
  if (edgarUserAgent) config.edgar = { userAgent: edgarUserAgent };
  if (env.FMP_API_KEY) config.fmp = { apiKey: env.FMP_API_KEY };
  if (env.ALPHAVANTAGE_API_KEY) config.alphavantage = { apiKey: env.ALPHAVANTAGE_API_KEY };
  if (env.POLYGON_API_KEY) config.polygon = { apiKey: env.POLYGON_API_KEY };
  // yfinance needs no credentials and is on by default; an explicit "false" disables it.
  if (env.YFINANCE_ENABLED === "false") config.yfinance = { enabled: false };
  return config;
}

/**
 * Builds the full default registry: every source adapter this package knows
 * about, each paired with its slice of `config`. Sources with no config are
 * still constructed (with placeholder empty credentials) so the registry is
 * complete and deterministic - they just answer `isAvailable === false` and
 * are skipped at run time rather than being silently absent.
 */
export function createDefaultAdapters(config: OrchestratorConfig = {}): AdapterRegistration[] {
  const edgar: EdgarConfig = config.edgar ?? { userAgent: "" };
  const fmp: FmpConfig = config.fmp ?? { apiKey: "" };
  const alphavantage: AlphaVantageConfig = config.alphavantage ?? { apiKey: "" };
  const polygon: PolygonConfig = config.polygon ?? { apiKey: "" };
  const yfinance: YfinanceConfig = config.yfinance ?? {};
  const html: HtmlConfig = config.html ?? {};

  return [
    { adapter: createEdgarAdapter(edgar), config: edgar },
    { adapter: createFmpAdapter(fmp), config: fmp },
    { adapter: createAlphaVantageAdapter(alphavantage), config: alphavantage },
    { adapter: createPolygonAdapter(polygon), config: polygon },
    { adapter: createYfinanceAdapter(yfinance), config: yfinance },
    // HTML scraping is the last-resort Tier 4 source: no credentials, no
    // schema contract, so it runs only after every higher tier has had its
    // chance. Appended last so it is the final fallthrough in tier order.
    { adapter: createHtmlAdapter(html), config: html },
  ];
}
