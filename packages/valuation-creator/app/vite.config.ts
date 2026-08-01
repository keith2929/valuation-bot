import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  // '/' for the root of keith2929.github.io, '/valuation-bot/' for a project page deploy.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  resolve: {
    preserveSymlinks: false,
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: "@valuation-bot/contract",
        replacement: `${workspaceRoot}/packages/contract/src/index.ts`,
      },
      {
        find: "@valuation-bot/adapter",
        replacement: `${workspaceRoot}/packages/adapter/src/index.ts`,
      },
      {
        find: "@valuation-bot/valuation-creator-core",
        replacement: `${workspaceRoot}/packages/valuation-creator/core/src/index.ts`,
      },
      {
        find: "@valuation-bot/valuation-creator",
        replacement: `${workspaceRoot}/packages/valuation-creator/src/index.ts`,
      },
    ],
  },
  server: {
    host: process.env.VITE_DEV_HOST ?? "127.0.0.1",
    port: process.env.VITE_DEV_PORT ? Number(process.env.VITE_DEV_PORT) : 4502,
    strictPort: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  test: {
    environment: "jsdom",
  },
});
