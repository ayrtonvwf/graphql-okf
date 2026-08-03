import { describe, expect, it } from "vitest";
import { buildBundle } from "../emit/bundle.js";
import { emitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, HUMAN_HINT } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { type FileAction, reconcile } from "./plan.js";

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";

/** Type guard to narrow FileAction to non-delete actions */
function isNotDelete(action: FileAction): action is Exclude<FileAction, { kind: "delete" }> {
  return action.kind !== "delete";
}

const ir: SchemaIr = {
  resource: "schema.graphql",
  origin: "sdl",
  concepts: [
    {
      kind: "object",
      name: "Country",
      path: "types/Country.md",
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
  for (const [path, parts] of buildBundle(source, emitContext("0.1", timestamp))) {
    files.set(path, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

describe("reconcile", () => {
  it("creates every file when the bundle does not exist yet", () => {
    const plan = reconcile(ir, new Map(), emitContext("0.1", T1));

    expect(plan.added.map((change) => change.path)).toEqual(["types/Country.md"]);
    expect(plan.actions.some((action) => action.path === "index.md")).toBe(true);
    expect(plan.unchanged).toBe(0);
  });

  it("is a complete no-op against a bundle it just produced", () => {
    const plan = reconcile(ir, bundleOnDisk(ir, T1), emitContext("0.1", T2));

    expect(plan.actions).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("does not restamp an unchanged concept, even when the run's timestamp differs", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(ir, disk, emitContext("0.1", T2));

    expect(plan.actions).toEqual([]);
    expect(disk.get("types/Country.md")).toContain(`timestamp: ${JSON.stringify(T1)}`);
  });

  it("does not rewrite a concept whose only difference is the producer version", () => {
    const disk = bundleOnDisk(ir, T1);
    const plan = reconcile(ir, disk, emitContext("0.1", T2));

    expect(plan.changed).toEqual([]);
    expect(plan.actions.filter((action) => action.kind === "update")).toEqual([]);
  });

  it("updates a concept whose rendered content changed, stamping the new time", () => {
    const disk = bundleOnDisk(ir, T1);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, emitContext("0.1", T2));
    const action = plan.actions.find((entry) => entry.path === "types/Country.md");

    expect(plan.changed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("update");
    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      `timestamp: ${JSON.stringify(T2)}`,
    );
    expect(action && isNotDelete(action) ? action.contents : "").toContain("A sovereign state.");
  });

  it("preserves the human region verbatim when updating", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/Country.md";
    disk.set(`${path}`, `${disk.get(path) ?? ""}\nOur team owns this type.\n`);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, emitContext("0.1", T2));
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      "Our team owns this type.",
    );
  });

  it("recreates a concept file a human deleted", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.delete("types/Country.md");

    const plan = reconcile(ir, disk, emitContext("0.1", T2));

    expect(plan.added.map((change) => change.path)).toEqual(["types/Country.md"]);
  });

  it("leaves stray files alone and never lists them", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("guides/onboarding.md", "# Onboarding\n\nRead this first.\n");

    const plan = reconcile(ir, disk, emitContext("0.1", T2));

    expect(plan.actions).toEqual([]);
  });

  it("upgrades a legacy marker-less index.md to the seam form without logging it", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("index.md", "# API interface\n\n- [types/](types/index.md) — Types\n");

    const plan = reconcile(ir, disk, emitContext("0.1", T2));

    expect(plan.actions.map((action) => action.path)).toEqual(["index.md"]);
    expect(plan.actions[0]?.kind).toBe("index");
    expect(
      plan.actions[0] && isNotDelete(plan.actions[0]) ? plan.actions[0].contents : "",
    ).toContain("<!-- graphql-okf:generated:start -->");
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
  });

  it("preserves a human key added to the bundle-root index across a real re-run", () => {
    const first = reconcile(ir, new Map(), emitContext("0.1", T1));
    const rootAction = first.actions.find((action) => action.path === "index.md");
    if (rootAction === undefined || !isNotDelete(rootAction))
      throw new Error("expected a root index action");

    const edited = rootAction.contents.replace("---\n\n# ", "owner: platform-team\n---\n\n# ");
    const existing = new Map([["index.md", edited]]);

    // The schema genuinely diverges between runs in two ways that matter for
    // catching a broken mergeFrontmatter:
    //  1. A concept in a brand-new top-level directory, so the root index's
    //     generated listing of child directories differs from what's on
    //     disk and reconcile must actually emit an action for index.md
    //     (adding a concept under an existing top-level dir, e.g. types/,
    //     would not move the needle: the root index only lists immediate
    //     child dirs).
    //  2. The `resource` machine field itself changes value, so a
    //     mergeFrontmatter that just returns `existing` unchanged (the
    //     no-op the reviewer used to prove the old test tautological) is
    //     distinguishable from a real merge: only a real merge picks up the
    //     new resource value while still keeping the human `owner` key.
    const evolved: SchemaIr = {
      ...ir,
      resource: "schema-v2.graphql",
      concepts: [
        ...ir.concepts,
        {
          kind: "directive",
          name: "custom",
          path: "directives/custom.md",
          description: "A custom directive.",
          appliedDirectives: [],
          locations: ["FIELD"],
          args: [],
          isRepeatable: false,
        } as never,
      ],
    };

    const second = reconcile(evolved, existing, emitContext("0.1", T2));
    const rewritten = second.actions.find((action) => action.path === "index.md");
    if (rewritten === undefined || !isNotDelete(rewritten)) {
      throw new Error("expected reconcile to emit a real action for index.md on the second run");
    }

    // Preserved from the human edit — proves merge doesn't just re-render.
    expect(rewritten.contents).toContain("owner: platform-team");
    // Picked up from the new render — proves merge doesn't just keep existing.
    expect(rewritten.contents).toContain('resource: "schema-v2.graphql"');
    expect(rewritten.contents).toContain('okf_version: "0.1"');
  });

  it("counts index writes so they are never silent", () => {
    const plan = reconcile(ir, new Map(), emitContext("0.1", "2026-07-25T00:00:00.000Z"));

    expect(plan.indexes).toBe(plan.actions.filter((action) => action.kind === "index").length);
    expect(plan.indexes).toBeGreaterThan(0);
  });

  it("reports zero index writes on an unchanged re-run", () => {
    const first = reconcile(ir, new Map(), emitContext("0.1", "2026-07-25T00:00:00.000Z"));
    const existing = new Map(
      first.actions.filter(isNotDelete).map((action) => [action.path, action.contents]),
    );

    const second = reconcile(ir, existing, emitContext("0.1", "2026-07-25T00:00:00.000Z"));

    expect(second.indexes).toBe(0);
  });
});

/** A bundle exactly as a v0.1 run would have left it. */
function v1BundleOnDisk(source: SchemaIr, timestamp: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, parts] of buildBundle(source, emitContext("0.1", timestamp))) {
    files.set(path, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

describe("reconcile migrating a v0.1 bundle", () => {
  it("writes every migrated concept even though its content did not change", () => {
    const plan = reconcile(ir, v1BundleOnDisk(ir, T1), emitContext("0.2", T2));

    expect(plan.migrated.frontmatter).toEqual(["types/Country.md"]);
    const migrate = plan.actions.find((action) => action.kind === "migrate");
    expect(migrate?.path).toBe("types/Country.md");
    expect(migrate && isNotDelete(migrate) ? migrate.contents : "").toContain(
      'generated: { by: "graphql-okf/0.1", at: "2026-07-01T10:00:00.000Z" }',
    );
  });

  it("does not double-count a concept the schema also changed", () => {
    const disk = v1BundleOnDisk(ir, T1);
    const [country] = ir.concepts;
    if (country === undefined) throw new Error("fixture");
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...country, description: "A sovereign state." }],
    };

    const plan = reconcile(evolved, disk, emitContext("0.2", T2));
    const paths = plan.actions.map((action) => action.path);

    expect(paths.filter((path) => path === "types/Country.md")).toHaveLength(1);
    expect(plan.changed.map((change) => change.path)).toEqual(["types/Country.md"]);
  });

  it("reports nothing to migrate for a bundle it just wrote in v0.2", () => {
    const files = new Map<string, string>();
    for (const [path, parts] of buildBundle(ir, emitContext("0.2", T1))) {
      files.set(path, assembleFile(parts, EMPTY_HUMAN));
    }

    const plan = reconcile(ir, files, emitContext("0.2", T2));

    expect(plan.migrated.frontmatter).toEqual([]);
    expect(plan.actions.filter((action) => action.kind === "migrate")).toEqual([]);
  });

  it("migrates nothing when the run targets v0.1", () => {
    const plan = reconcile(ir, v1BundleOnDisk(ir, T1), emitContext("0.1", T2));

    expect(plan.migrated.frontmatter).toEqual([]);
  });
});

const emptyIr: SchemaIr = { resource: "schema.graphql", origin: "sdl", concepts: [] };

describe("reconcile removals", () => {
  it("tombstones a concept the schema no longer contains", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(emptyIr, disk, emitContext("0.1", T2));
    const action = plan.actions.find((entry) => entry.path === "types/Country.md");

    expect(plan.removed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("tombstone");
    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      'graphql_okf_status: "removed"',
    );
    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      `removedAt: ${JSON.stringify(T2)}`,
    );
    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      "# Last known definition",
    );
  });

  it("keeps the tombstoned file at its original path so inbound links resolve", () => {
    const plan = reconcile(emptyIr, bundleOnDisk(ir, T1), emitContext("0.1", T2));

    expect(plan.actions.map((action) => action.path)).toContain("types/Country.md");
  });

  it("preserves the human region of a concept it tombstones", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/Country.md";
    disk.set(path, `${disk.get(path) ?? ""}\nStill referenced by the billing service.\n`);

    const plan = reconcile(emptyIr, disk, emitContext("0.1", T2));
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action && isNotDelete(action) ? action.contents : "").toContain(
      "Still referenced by the billing service.",
    );
  });

  it("never re-tombstones: a second run against the same schema is a no-op", () => {
    const disk = bundleOnDisk(ir, T1);
    const first = reconcile(emptyIr, disk, emitContext("0.1", T2));
    for (const action of first.actions.filter(isNotDelete)) {
      disk.set(action.path, action.contents);
    }

    const second = reconcile(emptyIr, disk, emitContext("0.1", "2026-08-01T00:00:00.000Z"));

    expect(second.actions).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it("restores a concept that comes back, logging it as added", () => {
    const disk = bundleOnDisk(ir, T1);
    for (const action of reconcile(emptyIr, disk, emitContext("0.1", T2)).actions.filter(
      isNotDelete,
    )) {
      disk.set(action.path, action.contents);
    }

    const plan = reconcile(ir, disk, emitContext("0.1", "2026-08-01T00:00:00.000Z"));
    const action = plan.actions.find((entry) => entry.path === "types/Country.md");

    expect(plan.added.map((change) => change.name)).toEqual(["Country"]);
    expect(plan.changed).toEqual([]);
    expect(action && isNotDelete(action) ? action.contents : "").not.toContain("status: removed");
    expect(action && isNotDelete(action) ? action.contents : "").not.toContain("removedAt:");
    expect(action && isNotDelete(action) ? action.contents : "").not.toContain(
      "Last known definition",
    );
  });
});

describe("reconcile migrating a legacy-layout bundle", () => {
  it("moves a legacy-layout concept and deletes its old path", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));

    expect(plan.migrated.relocated).toEqual(["types/Country.md"]);
    expect(plan.actions).toContainEqual({ kind: "delete", path: "types/objects/Country.md" });
    expect(plan.removed).toEqual([]);
  });

  it("writes a moved concept whose content is otherwise unchanged", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));
    const written = plan.actions.filter((action) => action.path === "types/Country.md");

    expect(written).toHaveLength(1);
    expect(written[0]?.kind).toBe("migrate");
  });

  it("deletes an empty kind index and redirects one carrying human text", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
      [
        "types/scalars/index.md",
        assembleFile(
          { preamble: "# Scalar types\n\n", generated: "\n* [ID](/types/scalars/ID.md)\n" },
          EMPTY_HUMAN,
        ),
      ],
      [
        "types/objects/index.md",
        assembleFile(
          {
            preamble: "# Object types\n\n",
            generated: "\n* [Country](/types/objects/Country.md)\n",
          },
          `\n\n${HUMAN_HINT}\nSee ADR-14.\n`,
        ),
      ],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));

    expect(plan.actions).toContainEqual({ kind: "delete", path: "types/scalars/index.md" });

    const redirect = plan.actions.find((action) => action.path === "types/objects/index.md");
    expect(redirect?.kind).toBe("index");
    expect(redirect !== undefined && "contents" in redirect ? redirect.contents : "").toContain(
      "See ADR-14.",
    );
  });
});
