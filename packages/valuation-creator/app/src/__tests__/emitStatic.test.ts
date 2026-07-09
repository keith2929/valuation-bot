import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixtureProvider, SIA_FINANCIALS } from "@valuation-bot/valuation-creator";
import { emitStatic } from "../../scripts/emitStatic";

let outDir: string | undefined;

afterEach(async () => {
  if (outDir) {
    await rm(outDir, { recursive: true, force: true });
    outDir = undefined;
  }
});

describe("emitStatic", () => {
  it("writes <outDir>/<ticker>.json with statements deep-equal to SIA_FINANCIALS and no warnings", async () => {
    outDir = await mkdtemp(join(tmpdir(), "emit-static-"));

    const outPath = await emitStatic({ ticker: "C6L", exchange: "SGX", provider: new FixtureProvider(), outDir });

    expect(outPath).toBe(join(outDir, "C6L.json"));
    const payload = JSON.parse(await readFile(outPath, "utf-8"));
    expect(payload.statements).toEqual(SIA_FINANCIALS);
    expect(payload.warnings).toEqual([]);
  });
});
