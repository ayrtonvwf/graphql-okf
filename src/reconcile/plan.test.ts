import { describe, expect, it } from "vitest";
import { buildBundle } from "../emit/bundle.js";
import { assembleFile, EMPTY_HUMAN } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { reconcile } from "./plan.js";

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";

const ir: SchemaIr = {
  resource: "schema.graphql",
  origin: "sdl",
  concepts: [
    {
      kind: "object",
      name: "Country",
      path: "types/objects/Country.md",
      description: "An ISO country.",
      appliedDirectives: [],
      fields: [],
      interfaces: [],
    },
  ],
};

/** The bundle exactly as a previous run would have left it on disk. */
function bundleOnDisk(source: SchemaIr, timestamp: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, parts] of buildBundle(source, timestamp)) {
    files.set(path, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

describe("reconcile", () => {
  it("creates every file when the bundle does not exist yet", () => {
    const plan = reconcile(ir, new Map(), T1);

    expect(plan.added.map((change) => change.path)).toEqual(["types/objects/Country.md"]);
    expect(plan.actions.some((action) => action.path === "index.md")).toBe(true);
    expect(plan.unchanged).toBe(0);
  });

  it("is a complete no-op against a bundle it just produced", () => {
    const plan = reconcile(ir, bundleOnDisk(ir, T1), T2);

    expect(plan.actions).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("does not restamp an unchanged concept, even when the run's timestamp differs", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions).toEqual([]);
    expect(disk.get("types/objects/Country.md")).toContain(`timestamp: ${T1}`);
  });

  it("updates a concept whose rendered content changed, stamping the new time", () => {
    const disk = bundleOnDisk(ir, T1);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, T2);
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.changed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("update");
    expect(action?.contents).toContain(`timestamp: ${T2}`);
    expect(action?.contents).toContain("A sovereign state.");
  });

  it("preserves the human region verbatim when updating", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/objects/Country.md";
    disk.set(`${path}`, `${disk.get(path) ?? ""}\nOur team owns this type.\n`);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, T2);
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action?.contents).toContain("Our team owns this type.");
  });

  it("recreates a concept file a human deleted", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.delete("types/objects/Country.md");

    const plan = reconcile(ir, disk, T2);

    expect(plan.added.map((change) => change.path)).toEqual(["types/objects/Country.md"]);
  });

  it("leaves stray files alone and never lists them", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("guides/onboarding.md", "# Onboarding\n\nRead this first.\n");

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions).toEqual([]);
  });

  it("upgrades a legacy marker-less index.md to the seam form without logging it", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("index.md", "# API interface\n\n- [types/](types/index.md) — Types\n");

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions.map((action) => action.path)).toEqual(["index.md"]);
    expect(plan.actions[0]?.kind).toBe("index");
    expect(plan.actions[0]?.contents).toContain("<!-- graphql-okf:generated:start -->");
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
  });
});

const emptyIr: SchemaIr = { resource: "schema.graphql", origin: "sdl", concepts: [] };

describe("reconcile removals", () => {
  it("tombstones a concept the schema no longer contains", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(emptyIr, disk, T2);
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.removed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("tombstone");
    expect(action?.contents).toContain("status: removed");
    expect(action?.contents).toContain(`removedAt: ${T2}`);
    expect(action?.contents).toContain("## Last known definition");
  });

  it("keeps the tombstoned file at its original path so inbound links resolve", () => {
    const plan = reconcile(emptyIr, bundleOnDisk(ir, T1), T2);

    expect(plan.actions.map((action) => action.path)).toContain("types/objects/Country.md");
  });

  it("preserves the human region of a concept it tombstones", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/objects/Country.md";
    disk.set(path, `${disk.get(path) ?? ""}\nStill referenced by the billing service.\n`);

    const plan = reconcile(emptyIr, disk, T2);
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action?.contents).toContain("Still referenced by the billing service.");
  });

  it("never re-tombstones: a second run against the same schema is a no-op", () => {
    const disk = bundleOnDisk(ir, T1);
    const first = reconcile(emptyIr, disk, T2);
    for (const action of first.actions) {
      disk.set(action.path, action.contents);
    }

    const second = reconcile(emptyIr, disk, "2026-08-01T00:00:00.000Z");

    expect(second.actions).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it("restores a concept that comes back, logging it as added", () => {
    const disk = bundleOnDisk(ir, T1);
    for (const action of reconcile(emptyIr, disk, T2).actions) {
      disk.set(action.path, action.contents);
    }

    const plan = reconcile(ir, disk, "2026-08-01T00:00:00.000Z");
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.added.map((change) => change.name)).toEqual(["Country"]);
    expect(plan.changed).toEqual([]);
    expect(action?.contents).not.toContain("status: removed");
    expect(action?.contents).not.toContain("removedAt:");
    expect(action?.contents).not.toContain("Last known definition");
  });
});
