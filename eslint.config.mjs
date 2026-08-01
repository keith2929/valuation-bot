import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

const CONTRACT_SRC = "packages/contract/src/**/*.ts";
const CANONICAL_SRC = "packages/canonical/src/**/*.ts";
const SOURCE_ADAPTER_SRC = "packages/source-adapter/src/**/*.ts";
const TICKER_RESOLVER_SRC = "packages/ticker-resolver/src/**/*.ts";
const EDGAR_ADAPTER_SRC = "packages/edgar-adapter/src/**/*.ts";
const FMP_ADAPTER_SRC = "packages/fmp-adapter/src/**/*.ts";
const ALPHAVANTAGE_ADAPTER_SRC = "packages/alphavantage-adapter/src/**/*.ts";
const POLYGON_ADAPTER_SRC = "packages/polygon-adapter/src/**/*.ts";
const YFINANCE_ADAPTER_SRC = "packages/yfinance-adapter/src/**/*.ts";
const HTML_ADAPTER_SRC = "packages/html-adapter/src/**/*.ts";
const MERGE_ENGINE_SRC = "packages/merge-engine/src/**/*.ts";
const CORE_SRC = "packages/valuation-creator/core/src/**/*.ts";
const APP_SRC = "packages/valuation-creator/app/{src,scripts}/**/*.{ts,tsx}";

const DOM_NETWORK_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },

  // Base TS rules for every package.
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
      },
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
    rules: {
      // No cross-package relative imports across package roots: every
      // package here (contract, adapter, financial-statement-extract,
      // valuation-creator, valuation-creator/core, valuation-creator/app)
      // has its own package.json, so a relative import that resolves into
      // a sibling package is always a boundary violation - it must go
      // through the package's public entry point (its @valuation-bot/* name).
      "import/no-relative-packages": "error",
    },
  },

  // contract is the foundation package: it must not import anything, not
  // even other workspace packages or Node/browser builtins.
  {
    files: [CONTRACT_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.)",
              message:
                "packages/contract must not import anything - it is the dependency-free foundation package.",
            },
          ],
        },
      ],
    },
  },

  // canonical is also a dependency-free foundation package (the
  // fetchFinancials output schema): it must not import anything either.
  {
    files: [CANONICAL_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.)",
              message:
                "packages/canonical must not import anything - it is the dependency-free foundation package.",
            },
          ],
        },
      ],
    },
  },

  // source-adapter is the shared adapter contract + HTTP utility layer every
  // source adapter builds on: it may depend on @valuation-bot/canonical only,
  // not on contract, adapter, or any valuation-creator package.
  {
    files: [SOURCE_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$))",
              message:
                "packages/source-adapter may only import @valuation-bot/canonical (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // ticker-resolver resolves a raw ticker to a market and orders eligible
  // source adapters for it: it may depend on @valuation-bot/canonical and
  // @valuation-bot/source-adapter only, not on contract, adapter, or any
  // valuation-creator package.
  {
    files: [TICKER_RESOLVER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/ticker-resolver may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // edgar-adapter is the SEC EDGAR (Tier 1) source adapter. Like every source
  // adapter it builds on the shared contract + HTTP layer, so it may depend on
  // @valuation-bot/canonical and @valuation-bot/source-adapter only, not on
  // contract, adapter, ticker-resolver, or any valuation-creator package.
  {
    files: [EDGAR_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/edgar-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // fmp-adapter is the Financial Modeling Prep (Tier 2) source adapter. Like
  // every source adapter it builds on the shared contract + HTTP layer, so it
  // may depend on @valuation-bot/canonical and @valuation-bot/source-adapter
  // only, not on contract, adapter, ticker-resolver, edgar-adapter, or any
  // valuation-creator package.
  {
    files: [FMP_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/fmp-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // alphavantage-adapter is the Alpha Vantage (Tier 2) source adapter. Like
  // every source adapter it builds on the shared contract + HTTP layer, so it
  // may depend on @valuation-bot/canonical and @valuation-bot/source-adapter
  // only, not on contract, adapter, ticker-resolver, edgar-adapter,
  // fmp-adapter, or any valuation-creator package.
  {
    files: [ALPHAVANTAGE_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/alphavantage-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // polygon-adapter is the Polygon.io (Tier 2) source adapter. Like every
  // source adapter it builds on the shared contract + HTTP layer, so it may
  // depend on @valuation-bot/canonical and @valuation-bot/source-adapter
  // only, not on contract, adapter, ticker-resolver, edgar-adapter,
  // fmp-adapter, alphavantage-adapter, or any valuation-creator package.
  {
    files: [POLYGON_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/polygon-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // yfinance-adapter is the unofficial Yahoo Finance (Tier 3, "yfinance-class")
  // source adapter - a scraped/undocumented endpoint used only as a
  // last-resort, optional source. Like every source adapter it builds on the
  // shared contract + HTTP layer, so it may depend on @valuation-bot/canonical
  // and @valuation-bot/source-adapter only, not on contract, adapter,
  // ticker-resolver, edgar-adapter, fmp-adapter, alphavantage-adapter,
  // polygon-adapter, or any valuation-creator package.
  {
    files: [YFINANCE_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/yfinance-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // html-adapter is the Tier 4 scraped-HTML source adapter (published
  // financials pages like stockanalysis.com/Yahoo, not a documented API).
  // Like every source adapter it builds on the shared contract + HTTP layer,
  // so it may depend on @valuation-bot/canonical and
  // @valuation-bot/source-adapter only, not on contract, adapter,
  // ticker-resolver, edgar-adapter, fmp-adapter, alphavantage-adapter,
  // polygon-adapter, yfinance-adapter, or any valuation-creator package.
  {
    files: [HTML_ADAPTER_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/html-adapter may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // merge-engine is the pure per-field merge/normalize engine: it folds an
  // ordered list of adapter fragments into one canonical record. It needs the
  // output schema and the adapter/fragment contract, so it may depend on
  // @valuation-bot/canonical and @valuation-bot/source-adapter only, not on
  // contract, adapter, ticker-resolver, any source adapter, or any
  // valuation-creator package.
  {
    files: [MERGE_ENGINE_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/canonical$|@valuation-bot/source-adapter$))",
              message:
                "packages/merge-engine may only import @valuation-bot/canonical and @valuation-bot/source-adapter (and its own relative modules) - no other workspace package.",
            },
          ],
        },
      ],
    },
  },

  // valuation-creator/core may depend on @valuation-bot/contract only: no
  // react/react-dom, no @valuation-bot/adapter, no other workspace package,
  // and no Node network/filesystem builtins.
  {
    files: [CORE_SRC],
    languageOptions: {
      globals: Object.fromEntries(DOM_NETWORK_GLOBALS.map((name) => [name, "off"])),
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!(\\.|@valuation-bot/contract$))",
              message:
                "packages/valuation-creator/core may only import @valuation-bot/contract (and its own relative modules) - no react/react-dom, no @valuation-bot/adapter, no other workspace package, and no Node builtins.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...DOM_NETWORK_GLOBALS.map((name) => ({
          name,
          message: "packages/valuation-creator/core must not use DOM or network globals.",
        })),
      ],
    },
  },

  // app may not import financial-statement-extract.
  {
    files: [APP_SRC],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@valuation-bot/financial-statement-extract",
                "@valuation-bot/financial-statement-extract/*",
              ],
              message:
                "packages/valuation-creator/app must not import @valuation-bot/financial-statement-extract.",
            },
          ],
        },
      ],
    },
  },
);
