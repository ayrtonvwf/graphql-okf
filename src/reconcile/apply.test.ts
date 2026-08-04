import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan } from "./apply.js";
import type { BundlePlan } from "./plan.js";

const T = "2026-07-24T09:00:00.000Z";

const empty: BundlePlan = {
  actions: [],
  added: [],
  changed: [],
  removed: [],
  unchanged: 4,
  indexes: 0,
  migrated: { frontmatter: [], relocated: [], pruned: [], hintStripped: [] },
};

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "okf-apply-"));
}

describe("applyPlan", () => {
  it("writes nothing at all for an empty plan", async () => {
    const dir = await workspace();

    await applyPlan(empty, dir, T);

    expect(await readdir(dir)).toEqual([]);
  });

  it("creates nested files and their directories", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "create", path: "types/Country.md", contents: "country\n" }],
      added: [{ name: "Country", path: "types/Country.md" }],
      unchanged: 0,
    };

    await applyPlan(plan, dir, T);

    expect(await readFile(join(dir, "types/Country.md"), "utf8")).toBe("country\n");
  });

  it("leaves no temp files behind", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "index", path: "index.md", contents: "root\n" }],
    };

    await applyPlan(plan, dir, T);

    expect(await readdir(dir)).toEqual(["index.md"]);
  });

  it("keeps an existing log.md entry rather than replacing it", async () => {
    const dir = await workspace();
    await writeFile(
      join(dir, "log.md"),
      "---\ntype: Log\n---\n\n# Update Log\n\n## 2026-07-01\n\n### 00:00:00.000Z\n",
    );
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "create", path: "queries/a.md", contents: "a\n" }],
      added: [{ name: "a", path: "queries/a.md" }],
    };

    await applyPlan(plan, dir, T);
    const log = await readFile(join(dir, "log.md"), "utf8");

    expect(log).toContain("## 2026-07-01");
    expect(log.indexOf("## 2026-07-24")).toBeLessThan(log.indexOf("## 2026-07-01"));
    expect(log).toContain("* [`a`](/queries/a.md)");
  });

  it("rewrites log.md rather than appending, keeping one heading per day", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      actions: [{ kind: "create", path: "types/A.md", contents: "a" }],
      added: [{ name: "A", path: "types/A.md" }],
      changed: [],
      removed: [],
      unchanged: 0,
      indexes: 0,
      migrated: { frontmatter: [], relocated: [], pruned: [], hintStripped: [] },
    };

    await applyPlan(plan, dir, "2026-07-24T09:00:00.000Z");
    await applyPlan(plan, dir, "2026-07-24T17:30:00.000Z");

    const log = await readFile(join(dir, "log.md"), "utf8");

    expect(log.match(/^## 2026-07-24$/gm)).toHaveLength(1);
    expect(log.match(/^### /gm)).toHaveLength(2);
    expect(log.startsWith("---\ntype: Log\n---")).toBe(true);
  });

  it("writes no log entry for a plan that only touches index files", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "index", path: "index.md", contents: "root\n" }],
    };

    await applyPlan(plan, dir, T);

    expect(await readdir(dir)).toEqual(["index.md"]);
  });

  it("removes a file a delete action names, after writing the new one", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/Product.md"), "old\n", "utf8");

    await applyPlan(
      {
        ...empty,
        actions: [
          { kind: "migrate", path: "types/Product.md", contents: "new\n" },
          { kind: "delete", path: "types/objects/Product.md" },
        ],
      },
      dir,
      T,
    );

    expect(await readFile(join(dir, "types/Product.md"), "utf8")).toBe("new\n");
    await expect(readFile(join(dir, "types/objects/Product.md"), "utf8")).rejects.toThrow();
  });

  it("removes the directory a delete emptied", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/index.md"), "old\n", "utf8");

    await applyPlan(
      { ...empty, actions: [{ kind: "delete", path: "types/objects/index.md" }] },
      dir,
      T,
    );

    await expect(readdir(join(dir, "types/objects"))).rejects.toThrow();
  });

  it("leaves a directory that still holds a human's stray file", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/index.md"), "old\n", "utf8");
    await writeFile(join(dir, "types/objects/notes.md"), "mine\n", "utf8");

    await applyPlan(
      { ...empty, actions: [{ kind: "delete", path: "types/objects/index.md" }] },
      dir,
      T,
    );

    expect(await readdir(join(dir, "types/objects"))).toEqual(["notes.md"]);
  });

  it("tolerates a delete for a file that is already gone", async () => {
    const dir = await workspace();

    await expect(
      applyPlan(
        { ...empty, actions: [{ kind: "delete", path: "types/objects/Product.md" }] },
        dir,
        T,
      ),
    ).resolves.toBeUndefined();
  });
});
