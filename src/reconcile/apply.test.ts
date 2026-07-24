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

  it("appends the log entry to an existing log.md rather than replacing it", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "log.md"), "# Change log\n\n## 2026-07-01T00:00:00.000Z\n\n");
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "create", path: "queries/a.md", contents: "a\n" }],
      added: [{ name: "a", path: "queries/a.md" }],
    };

    await applyPlan(plan, dir, T);
    const log = await readFile(join(dir, "log.md"), "utf8");

    expect(log).toContain("## 2026-07-01T00:00:00.000Z");
    expect(log.indexOf("## 2026-07-01")).toBeLessThan(log.indexOf(`## ${T}`));
    expect(log).toContain("- [`a`](queries/a.md)");
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
