import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BENCH_ROOT } from "./constants.ts";
import { buildManifest } from "./manifest.ts";

describe("buildManifest", () => {
  it("records the pinned models", async () => {
    const manifest = await buildManifest();
    expect(manifest.agentModel).toBe("claude-sonnet-5");
    expect(manifest.judgeModel).toBe("claude-opus-5");
  });

  it("records the graphql-okf commit under test", async () => {
    const manifest = await buildManifest();
    expect(manifest.graphqlOkfCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("records the mcp product and version", async () => {
    const manifest = await buildManifest();
    expect(manifest.mcpServerPackage).not.toMatch(/REPLACE_ME/);
    expect(manifest.mcpServerVersion).not.toMatch(/REPLACE_ME/);
  });

  it("records a run date", async () => {
    expect(Number.isNaN(Date.parse((await buildManifest()).runDate ?? ""))).toBe(false);
  });
});

describe("judge blinding", () => {
  it("does not import the scenario vocabulary", async () => {
    const source = await readFile(join(BENCH_ROOT, "src", "judge.ts"), "utf8");
    expect(source).not.toMatch(/scenarios\.js/);
    expect(source).not.toMatch(/okf-bundle|graphql-mcp|baseline/);
  });
});
