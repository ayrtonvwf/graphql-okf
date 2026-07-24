import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSchema, syncOkfBundle } from "../src/index.js";
import { applyPlan } from "../src/reconcile/apply.js";
import { reconcile } from "../src/reconcile/plan.js";
import { readExistingBundle } from "../src/reconcile/read.js";
import { readTree as snapshot } from "./support/bundle-tree.js";

const BASE = new URL("./fixtures/kitchen-sink.graphql", import.meta.url).pathname;
const EVOLVED = new URL("./fixtures/kitchen-sink-evolved.graphql", import.meta.url).pathname;

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";

async function freshBundle(sdl: string): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-recon-")), "bundle");
  await syncOkfBundle({ source: { kind: "sdl", path: sdl }, outDir, now: T1 });
  return outDir;
}

describe("re-running against an unchanged schema", () => {
  it("is a byte-for-byte no-op with no new log entry (DOD-G-3)", async () => {
    const outDir = await freshBundle(BASE);
    const before = await snapshot(outDir);
    const logBefore = before.get("log.md");

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(await snapshot(outDir)).toEqual(before);
    expect((await snapshot(outDir)).get("log.md")).toBe(logBefore);
  });

  it("does not even touch file mtimes", async () => {
    const outDir = await freshBundle(BASE);
    const target = join(outDir, "index.md");
    const before = (await stat(target)).mtimeMs;

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect((await stat(target)).mtimeMs).toBe(before);
  });

  it("stays a no-op on a bundle that already contains a tombstone", async () => {
    const outDir = await freshBundle(EVOLVED);
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });
    const before = await snapshot(outDir);

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: "2026-09-01T00:00:00.000Z",
    });

    expect(result.removed).toEqual([]);
    expect(await snapshot(outDir)).toEqual(before);
  });
});

describe("re-running against an evolved schema (DOD-G-4)", () => {
  it("adds, updates and tombstones exactly the affected concepts", async () => {
    const outDir = await freshBundle(BASE);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    expect(result.added).toContain("types/objects/Invoice.md");
    expect(result.added).toContain("queries/invoices.md");
    expect(result.removed).toContain("types/objects/User_case.md");
    expect(result.changed.length).toBeGreaterThan(0);
  });

  it("appends one dated log entry describing the change", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const log = await readFile(join(outDir, "log.md"), "utf8");

    expect(log).toContain(`## ${T2}`);
    expect(log).toContain("- [`Invoice`](types/objects/Invoice.md)");
    expect(log).toContain("**Removed**");
    expect(log.indexOf(`## ${T1}`)).toBeLessThan(log.indexOf(`## ${T2}`));
  });

  it("preserves human prose in a concept it updates", async () => {
    const outDir = await freshBundle(BASE);
    const target = join(outDir, "types/objects/User_case.md");
    await writeFile(target, `${await readFile(target, "utf8")}\n## Ownership\n\nBilling team.\n`);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const after = await readFile(target, "utf8");
    expect(after).toContain("status: removed");
    expect(after).toContain("Billing team.");
  });

  it("keeps a tombstone listed in its directory index", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const index = await readFile(join(outDir, "types/objects/index.md"), "utf8");

    expect(index).toContain("— (removed)");
  });

  it("leaves a stray human file untouched and unlisted", async () => {
    const outDir = await freshBundle(BASE);
    await writeFile(join(outDir, "ONBOARDING.md"), "# Onboarding\n\nStart here.\n");

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    expect(await readFile(join(outDir, "ONBOARDING.md"), "utf8")).toBe(
      "# Onboarding\n\nStart here.\n",
    );
    expect(await readFile(join(outDir, "index.md"), "utf8")).not.toContain("ONBOARDING");
  });

  it("keeps every Markdown link resolving after a removal", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const files = await snapshot(outDir);
    const missing: string[] = [];
    for (const [path, contents] of files) {
      if (path === "log.md") continue;
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      for (const match of contents.matchAll(/\]\((?!https?:)([^)]+\.md)\)/g)) {
        const target = match[1];
        if (target === undefined) continue;
        const resolved = new URL(target, `file:///${dir === "" ? "" : `${dir}/`}`).pathname.slice(
          1,
        );
        if (!files.has(resolved)) missing.push(`${path} -> ${target}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("restores a concept when the schema brings it back", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: "2026-09-01T00:00:00.000Z",
    });

    expect(result.added).toContain("types/objects/User_case.md");
    const restored = await readFile(join(outDir, "types/objects/User_case.md"), "utf8");
    expect(restored).not.toContain("status: removed");
    expect(restored).not.toContain("Last known definition");
  });
});

describe("an interrupted run (GOAL-8.5)", () => {
  it("converges on the next run to the same bytes an uninterrupted run produces", async () => {
    const interrupted = await freshBundle(BASE);
    const clean = await freshBundle(BASE);

    // Uninterrupted: the reference result.
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir: clean, now: T2 });

    // Interrupted: apply only the first half of the very same plan.
    const ir = await readSchema({ kind: "sdl", path: EVOLVED });
    const existing = await readExistingBundle(interrupted);
    const plan = reconcile(ir, existing, T2);
    const half = Math.floor(plan.actions.length / 2);
    expect(half).toBeGreaterThan(0);
    await applyPlan({ ...plan, actions: plan.actions.slice(0, half) }, interrupted, T2);

    // The next run finishes the job.
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir: interrupted, now: T2 });

    const recovered = await snapshot(interrupted);
    const reference = await snapshot(clean);
    recovered.delete("log.md");
    reference.delete("log.md");
    expect(recovered).toEqual(reference);
  });

  it("leaves no temp files behind after recovery", async () => {
    const outDir = await freshBundle(BASE);
    const ir = await readSchema({ kind: "sdl", path: EVOLVED });
    const plan = reconcile(ir, await readExistingBundle(outDir), T2);
    await applyPlan({ ...plan, actions: plan.actions.slice(0, 2) }, outDir, T2);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const files = await snapshot(outDir);
    expect([...files.keys()].filter((path) => path.includes("graphql-okf-tmp"))).toEqual([]);
  });
});
