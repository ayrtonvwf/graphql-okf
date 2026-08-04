import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { emitContext } from "../src/emit/context.js";
import { assembleFile, LEGACY_HUMAN_HINT } from "../src/emit/render/seam.js";
import { readSchema, syncOkfBundle } from "../src/index.js";
import { applyPlan } from "../src/reconcile/apply.js";
import { splitFile } from "../src/reconcile/parse.js";
import { reconcile } from "../src/reconcile/plan.js";
import { readExistingBundle } from "../src/reconcile/read.js";
import { readTree as snapshot, writeTree } from "./support/bundle-tree.js";

const BASE = new URL("./fixtures/kitchen-sink.graphql", import.meta.url).pathname;
const EVOLVED = new URL("./fixtures/kitchen-sink-evolved.graphql", import.meta.url).pathname;
const V1 = new URL("../examples/shop-api/v1.graphql", import.meta.url).pathname;

const RESOURCE = "https://shop.example/graphql";
const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";
const T3 = "2026-08-01T00:00:00.000Z";

async function v1Bundle(sdl = BASE): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-migrate-")), "bundle");
  await syncOkfBundle({ source: { kind: "sdl", path: sdl }, outDir, now: T1, okfVersion: "0.1" });
  return outDir;
}

/**
 * A bundle as a pre-#24 release wrote it: every owned file's human region holds
 * only the hint comment the emitter used to write at creation. Today's
 * `syncOkfBundle` no longer emits that hint, so this can only be reproduced by
 * hand — sync a current bundle, then splice the legacy human region back in.
 */
async function writeLegacyBundle(): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-legacy-hint-")), "bundle");
  await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });

  const LEGACY_EMPTY = `\n\n${LEGACY_HUMAN_HINT}\n`;
  const tree = await snapshot(outDir);
  for (const [path, text] of tree) {
    const split = splitFile(text, path);
    if (split !== null) {
      tree.set(path, assembleFile(split.parts, LEGACY_EMPTY));
    }
  }
  await writeTree(outDir, tree);

  return outDir;
}

function frontmatterOf(text: string): Record<string, unknown> {
  const closing = text.indexOf("\n---\n", 3);
  return parse(text.slice(4, closing + 1)) as Record<string, unknown>;
}

describe("migrating a v0.1 bundle to v0.2", () => {
  it("converts every concept and preserves its original timestamp", async () => {
    const outDir = await v1Bundle();

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(result.migrated.length).toBeGreaterThan(0);
    for (const [path, text] of await snapshot(outDir)) {
      if (path === "log.md" || path.endsWith("index.md")) continue;
      const front = frontmatterOf(text);
      expect(front.timestamp, `${path} still carries a v0.1 timestamp`).toBeUndefined();
      expect(front.generated, `${path} has no v0.2 provenance`).toEqual({
        by: "graphql-okf/0.1",
        at: T1,
      });
    }
  });

  it("declares the new version on the root index", async () => {
    const outDir = await v1Bundle();

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(await readFile(join(outDir, "index.md"), "utf8")).toContain('okf_version: "0.2"');
  });

  it("preserves human frontmatter keys and human prose verbatim (GOAL-8.3)", async () => {
    const outDir = await v1Bundle();
    const target = join(outDir, "types/User.md");
    const original = await readFile(target, "utf8");
    const edited = original
      .replace('timestamp: "', 'owner: "platform-team"\ntimestamp: "')
      .replace(/$/, "\nOur own notes about User.\n");
    await writeFile(target, edited);

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    const after = await readFile(target, "utf8");
    expect(after).toContain('owner: "platform-team"');
    expect(after).toContain("Our own notes about User.");
    expect(after).toContain('generated: { by: "graphql-okf/0.1", at: "2026-07-01T10:00:00.000Z" }');
  });

  it("logs the migration once, as a count and not a list", async () => {
    const outDir = await v1Bundle();

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    const log = await readFile(join(outDir, "log.md"), "utf8");
    expect(log).toContain("**Migrated**");
    expect(log).toContain(
      `* OKF bundle format 0.1 → 0.2 (\`timestamp\` → \`generated\`) across ${result.migrated.length} concepts.`,
    );
    expect(log.match(/\*\*Migrated\*\*/g)).toHaveLength(1);
  });

  it("still reports genuine schema changes made in the same run", async () => {
    const outDir = await v1Bundle();

    const result = await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    expect(result.added.length).toBeGreaterThan(0);
    const log = await readFile(join(outDir, "log.md"), "utf8");
    expect(log).toContain("**Migrated**");
    expect(log).toContain("**Added**");
  });

  it("is a byte-identical no-op on the next run, with no new log entry (GOAL-8.1, GOAL-8.4)", async () => {
    const outDir = await v1Bundle();
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });
    const before = await snapshot(outDir);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3 });

    expect(result.migrated).toEqual([]);
    expect(await snapshot(outDir)).toEqual(before);
  });

  it("converges after an interrupted migration (GOAL-8.5)", async () => {
    const outDir = await v1Bundle();
    const ir = await readSchema({ kind: "sdl", path: BASE });
    const plan = reconcile(ir, await readExistingBundle(outDir), emitContext("0.2", T2));
    const half = Math.floor(plan.actions.length / 2);
    expect(half).toBeGreaterThan(0);

    await applyPlan({ ...plan, actions: plan.actions.slice(0, half) }, outDir, T2);
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3 });

    for (const [path, text] of await snapshot(outDir)) {
      if (path === "log.md" || path.endsWith("index.md")) continue;
      expect(frontmatterOf(text).timestamp, `${path} was left behind`).toBeUndefined();
      expect(frontmatterOf(text).generated, `${path} was left behind`).toBeDefined();
    }
  });

  it("migrates a tombstone written by a v0.1 run", async () => {
    const outDir = await v1Bundle(EVOLVED);
    await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: T2,
      okfVersion: "0.1",
    });

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3 });

    const tombstones = [...(await snapshot(outDir))].filter(([, text]) =>
      text.includes('graphql_okf_status: "removed"'),
    );
    expect(tombstones.length).toBeGreaterThan(0);
    for (const [path, text] of tombstones) {
      expect(frontmatterOf(text).generated, `${path} tombstone not migrated`).toBeDefined();
    }
  });

  it("refuses to downgrade once migrated", async () => {
    const outDir = await v1Bundle();
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    await expect(
      syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3, okfVersion: "0.1" }),
    ).rejects.toThrow(/OKF 0\.2 bundle/);
  });

  it("never rewrites a stray file it does not own, even with timestamp-like frontmatter (GOAL-8.3)", async () => {
    const outDir = await v1Bundle();
    const strayPath = join(outDir, "NOTES.md");
    const stray = [
      "---",
      'timestamp: "2020-01-01T00:00:00.000Z"',
      "---",
      "",
      "Hand-written notes, not a graphql-okf concept.",
      "",
    ].join("\n");
    await writeFile(strayPath, stray);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(await readFile(strayPath, "utf8")).toBe(stray);
    expect(result.migrated).not.toContain("NOTES.md");
  });

  it("stays deterministic: two v0.2 runs from scratch are identical", async () => {
    const first = join(await mkdtemp(join(tmpdir(), "okf-det-")), "bundle");
    const second = join(await mkdtemp(join(tmpdir(), "okf-det-")), "bundle");

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir: first, now: T1 });
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir: second, now: T1 });

    expect(await snapshot(first)).toEqual(await snapshot(second));
  });

  it("strips the human hint from an untouched file and keeps a human's own words (#24)", async () => {
    const outDir = await writeLegacyBundle();
    await appendFile(join(outDir, "types/Product.md"), "\n## Ownership\n\nCatalog team.\n");

    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T2, resource: RESOURCE });

    const order = await readFile(join(outDir, "types/Order.md"), "utf8");
    const product = await readFile(join(outDir, "types/Product.md"), "utf8");

    expect(order).not.toContain("Human-authored content below this line");
    expect(product).toContain("Human-authored content below this line");
    expect(product).toContain("Catalog team.");
  });
});
