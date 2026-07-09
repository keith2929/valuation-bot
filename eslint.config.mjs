import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

const CONTRACT_SRC = "packages/contract/src/**/*.ts";
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
