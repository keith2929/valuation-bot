import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CompanyRef, Exchange, FinancialStatements, MarketDataProvider } from "@valuation-bot/contract";
import { FixtureProvider } from "@valuation-bot/valuation-creator";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `app/public/data` -- served as `${BASE_URL}data/<ticker>.json` and fetched by `StaticJsonProvider`. */
export const DEFAULT_OUT_DIR = resolve(__dirname, "..", "public", "data");

export interface EmitStaticOptions {
  ticker: string;
  exchange: Exchange;
  /** Any MarketDataProvider -- `FixtureProvider` for the reference model, or an adapter-backed `ExtractionProvider` once extraction results exist for a company. */
  provider: MarketDataProvider;
  outDir?: string;
}

interface WarningsCapableProvider extends MarketDataProvider {
  getWarnings(id: CompanyRef): string[];
}

function hasGetWarnings(provider: MarketDataProvider): provider is WarningsCapableProvider {
  return typeof (provider as Partial<WarningsCapableProvider>).getWarnings === "function";
}

interface StaticFinancialsPayload {
  statements: FinancialStatements;
  warnings: string[];
}

/**
 * Runs `provider.getFinancials` once (offline, ahead of deploy) and writes the
 * result plus any adapter/extraction warnings to `<outDir>/<ticker>.json`.
 * GitHub Pages can only serve static files -- the extraction pipeline needs an
 * LLM call and PDF parsing, so it runs here instead, and the deployed app
 * fetches this precomputed JSON via `StaticJsonProvider`.
 */
export async function emitStatic({ ticker, exchange, provider, outDir = DEFAULT_OUT_DIR }: EmitStaticOptions): Promise<string> {
  const company = await provider.searchTicker(ticker, exchange);
  const statements = await provider.getFinancials(company);
  const warnings = hasGetWarnings(provider) ? provider.getWarnings(company) : [];
  const payload: StaticFinancialsPayload = { statements, warnings };

  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `${company.ticker}.json`);
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return outPath;
}

async function main(): Promise<void> {
  const outPath = await emitStatic({
    ticker: "C6L",
    exchange: "SGX",
    provider: new FixtureProvider(),
  });
  console.log(`Wrote ${outPath}`);
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
