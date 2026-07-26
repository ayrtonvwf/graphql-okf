import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
      actions: [{ kind: "create", path: "types/objects/Country.md", contents: "country\n" }],
      added: [{ name: "Country", path: "types/objects/Country.md" }],
      unchanged: 0,
    };

    await applyPlan(plan, dir, T);

    expect(await readFile(join(dir, "types/objects/Country.md"), "utf8")).toBe("country\n");
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
    expect(log).toContain("* [`a`](queries/a.md)");
  });

  it("rewrites log.md rather than appending, keeping one heading per day", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      actions: [{ kind: "create", path: "types/objects/A.md", contents: "a" }],
      added: [{ name: "A", path: "types/objects/A.md" }],
      changed: [],
      removed: [],
      unchanged: 0,
      indexes: 0,
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
});
