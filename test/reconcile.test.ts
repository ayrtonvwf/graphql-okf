import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitContext } from "../src/emit/context.js";
import { readSchema, syncOkfBundle } from "../src/index.js";
import { applyPlan } from "../src/reconcile/apply.js";
import { reconcile } from "../src/reconcile/plan.js";
import { readExistingBundle } from "../src/reconcile/read.js";
import { readTree, readTree as snapshot, writeTree } from "./support/bundle-tree.js";

const BASE = new URL("./fixtures/kitchen-sink.graphql", import.meta.url).pathname;
const EVOLVED = new URL("./fixtures/kitchen-sink-evolved.graphql", import.meta.url).pathname;

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";
const T3 = "2026-08-01T09:00:00.000Z";

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

    expect(result.added).toContain("types/Invoice.md");
    expect(result.added).toContain("queries/invoices.md");
    expect(result.removed).toContain("types/User_case.md");
    expect(result.changed.length).toBeGreaterThan(0);
  });

  it("appends one dated log entry describing the change", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const log = await readFile(join(outDir, "log.md"), "utf8");

    expect(log).toContain(`## ${T2.slice(0, 10)}`);
    expect(log).toContain("* [`Invoice`](/types/Invoice.md)");
    expect(log).toContain("**Removed**");
    expect(log.indexOf(`## ${T2.slice(0, 10)}`)).toBeLessThan(log.indexOf(`## ${T1.slice(0, 10)}`));
  });

  it("preserves human prose in a concept it updates", async () => {
    const outDir = await freshBundle(BASE);
    const target = join(outDir, "types/User_case.md");
    await writeFile(target, `${await readFile(target, "utf8")}\n## Ownership\n\nBilling team.\n`);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const after = await readFile(target, "utf8");
    expect(after).toContain('graphql_okf_status: "removed"');
    expect(after).toContain("Billing team.");
  });

  it("keeps a tombstone listed in its directory index", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const index = await readFile(join(outDir, "types/index.md"), "utf8");

    expect(index).toContain("- (removed)");
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

    expect(result.added).toContain("types/User_case.md");
    const restored = await readFile(join(outDir, "types/User_case.md"), "utf8");
    expect(restored).not.toContain("status: removed");
    expect(restored).not.toContain("Last known definition");
  });
});

describe("a bundle written before absolute links", () => {
  it("converts links, preserves human content, and logs the concepts as changed", async () => {
    const outDir = await freshBundle(BASE);
    const before = await snapshot(outDir);

    // Rewrite every emitted link back to a relative form, standing in for a
    // bundle written by an older release. The `../`-per-level spelling is not
    // byte-identical to what the old emitter produced (it emitted the shortest
    // relative path), but it resolves to the same file, which is all this test
    // needs: the point is that the new run replaces whatever relative form it
    // finds.
    const legacy = new Map<string, string>();
    for (const [path, text] of before) {
      const prefix = "../".repeat(path.split("/").length - 1);
      legacy.set(path, text.replaceAll("](/", `](${prefix}`));
    }

    // A human edit that must survive the conversion untouched, including its
    // own relative link, which is the human's to maintain, not ours.
    //
    // User, not Post: Task 5 gave Post.author a description carrying a
    // relative link, which GOAL-6.3 preserves verbatim into a generated table
    // cell. The "nothing relative in the generated region" assertion below
    // would rightly flag it, and this test is not the place to argue about it.
    const concept = "types/User.md";
    expect(before.has(concept), `${concept} missing from the fixture bundle`).toBe(true);
    const human = "\n## Ownership\n\nOwned by Catalog. See [runbook](../../runbook.md).\n";
    legacy.set(concept, `${legacy.get(concept) ?? ""}${human}`);
    await writeTree(outDir, legacy);

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: T2,
    });
    const after = await snapshot(outDir);
    const text = after.get(concept) ?? "";

    // Links converted: nothing relative survives inside the generated region.
    const generated = text.slice(
      text.indexOf("<!-- graphql-okf:generated:start -->"),
      text.indexOf("<!-- graphql-okf:generated:end -->"),
    );
    expect(generated).toContain("](/types/");
    expect(generated).not.toContain("](../");

    // The human region survived verbatim, relative link and all.
    expect(text).toContain("See [runbook](../../runbook.md).");

    // Logged as changed, not added; nothing removed.
    expect(result.changed).toContain(concept);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);

    // No tombstone anywhere: no path moved.
    for (const [path, contents] of after) {
      expect(contents, `${path} was tombstoned`).not.toContain('graphql_okf_status: "removed"');
    }

    // Same file set, before and after.
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
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
    const plan = reconcile(ir, existing, emitContext("0.1", T2));
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
    const plan = reconcile(ir, await readExistingBundle(outDir), emitContext("0.1", T2));
    await applyPlan({ ...plan, actions: plan.actions.slice(0, 2) }, outDir, T2);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const files = await snapshot(outDir);
    expect([...files.keys()].filter((path) => path.includes("graphql-okf-tmp"))).toEqual([]);
  });
});

describe("migrating a bundle from the nested types layout", () => {
  const LEGACY_DIR: Record<string, string> = {
    object: "objects",
    interface: "interfaces",
    union: "unions",
    enum: "enums",
    input: "inputs",
    scalar: "scalars",
  };

  /**
   * Re-nests a flat bundle into the pre-#22 layout, using each concept's `type:`
   * frontmatter to pick its kind directory, and rebuilds the kind indexes.
   */
  function toLegacyLayout(flat: ReadonlyMap<string, string>): Map<string, string> {
    const nested = new Map<string, string>();
    const byDir = new Map<string, string[]>();

    for (const [path, text] of flat) {
      if (!path.startsWith("types/") || path === "types/index.md") {
        nested.set(path, text);
        continue;
      }
      const label = /^type: "GraphQL (\w+) Type"$/m.exec(text)?.[1]?.toLowerCase() ?? "object";
      const dir = `types/${LEGACY_DIR[label] ?? "objects"}`;
      const name = path.slice("types/".length);
      nested.set(`${dir}/${name}`, text);

      const bucket = byDir.get(dir);
      if (bucket === undefined) {
        byDir.set(dir, [name]);
      } else {
        bucket.push(name);
      }
    }

    for (const [dir, names] of byDir) {
      const bullets = [...names]
        .sort()
        .map((name) => `* [${name.replace(/\.md$/, "")}](/${dir}/${name})`);
      nested.set(
        `${dir}/index.md`,
        `# Types\n\n<!-- graphql-okf:generated:start -->\n${bullets.join("\n")}\n<!-- graphql-okf:generated:end -->\n\n<!-- Human-authored content below this line is preserved across regenerations. -->\n`,
      );
    }

    return nested;
  }

  it("moves every concept, keeps human text, and is a no-op on re-run", async () => {
    const build = join(await mkdtemp(join(tmpdir(), "okf-flat-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir: build, now: T1 });
    const legacy = toLegacyLayout(await readTree(build));

    // Human text in a concept and in a kind index — the two things a move can destroy.
    const post = legacy.get("types/objects/Post.md") ?? "";
    legacy.set("types/objects/Post.md", `${post}\n## Ownership\n\nPing #catalog.\n`);
    const objectsIndex = legacy.get("types/objects/index.md") ?? "";
    legacy.set("types/objects/index.md", `${objectsIndex}\nSee ADR-14.\n`);

    const outDir = join(await mkdtemp(join(tmpdir(), "okf-legacy-")), "bundle");
    await writeTree(outDir, legacy);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });
    const after = await readTree(outDir);

    // Every concept moved.
    expect([...after.keys()].filter((path) => /^types\/\w+\//.test(path))).toEqual([
      "types/objects/index.md",
    ]);
    expect(after.has("types/Post.md")).toBe(true);
    expect(result.relocated.length).toBeGreaterThan(0);

    // A type that links to nothing still reached its new path — the sameContent trap.
    expect(after.has("types/Boolean.md")).toBe(true);

    // Human text survived both moves.
    expect(after.get("types/Post.md")).toContain("Ping #catalog.");
    expect(after.get("types/objects/index.md")).toContain("See ADR-14.");
    expect(after.get("types/objects/index.md")).toContain("* [Types](/types/index.md)");

    // Emptied kind directories are gone; nothing was tombstoned.
    expect(after.has("types/scalars/index.md")).toBe(false);
    expect(result.removed).toEqual([]);

    // The log records the layout change once.
    const log = after.get("log.md") ?? "";
    expect(log).toContain("* Bundle layout: `types/<kind>/` flattened into `types/` across");

    // Second run is a complete no-op (GOAL-8.1).
    const again = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3 });
    expect(again.added).toEqual([]);
    expect(again.changed).toEqual([]);
    expect(again.relocated).toEqual([]);
    expect(await readTree(outDir)).toEqual(after);
  });

  it("moves a tombstoned concept to its flat path and keeps it under Removed", async () => {
    const build = join(await mkdtemp(join(tmpdir(), "okf-flat-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir: build, now: T1 });
    // Tombstone types/User_case.md while the bundle is still flat, per the
    // BASE -> EVOLVED pattern used elsewhere in this file.
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir: build, now: T2 });
    const legacy = toLegacyLayout(await readTree(build));
    expect(legacy.has("types/objects/User_case.md")).toBe(true);

    const outDir = join(await mkdtemp(join(tmpdir(), "okf-legacy-tombstone-")), "bundle");
    await writeTree(outDir, legacy);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T3 });
    const after = await readTree(outDir);

    // The tombstoned concept moved to its new flat path.
    expect(after.has("types/User_case.md")).toBe(true);
    expect(after.has("types/objects/User_case.md")).toBe(false);
    expect(after.get("types/User_case.md")).toContain('graphql_okf_status: "removed"');

    // It is still listed under Removed in the flattened types index.
    const typesIndex = after.get("types/index.md") ?? "";
    expect(typesIndex).toContain("## Removed");
    expect(typesIndex).toContain("User_case");
  });

  it("leaves a human's stray file and its directory alone", async () => {
    const build = join(await mkdtemp(join(tmpdir(), "okf-flat-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir: build, now: T1 });
    const legacy = toLegacyLayout(await readTree(build));
    legacy.set("types/objects/notes.md", "# My notes\n");

    const outDir = join(await mkdtemp(join(tmpdir(), "okf-stray-")), "bundle");
    await writeTree(outDir, legacy);
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    const after = await readTree(outDir);
    expect(after.get("types/objects/notes.md")).toBe("# My notes\n");
  });
});
