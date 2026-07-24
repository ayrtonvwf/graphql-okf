import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { SchemaIr } from "../model/ir.js";
import { project } from "../model/project.js";
import type { LoadedSchema } from "../source/types.js";
import { buildBundle } from "./bundle.js";
import type { FileParts } from "./render/seam.js";
import { assembleFile, EMPTY_HUMAN } from "./render/seam.js";

const TS = "2026-07-23T12:00:00.000Z";

function irFrom(sdl: string): SchemaIr {
  const loaded: LoadedSchema = {
    schema: buildSchema(sdl),
    resource: "test.graphql",
    origin: "sdl",
  };
  return project(loaded);
}

function bundleFrom(sdl: string): ReadonlyMap<string, FileParts> {
  return buildBundle(irFrom(sdl), TS);
}

const irWithOneObject = irFrom(`
  "An ISO country."
  type Country { code: ID! }
  type Query { countries: [Country!]! }
`);

const irWithNoInputs = irFrom("type Query { hello: String }");

function assembled(bundle: ReadonlyMap<string, FileParts>, path: string): string {
  const parts = bundle.get(path);
  if (!parts) {
    throw new Error(`bundle has no entry for ${path}`);
  }
  return assembleFile(parts, EMPTY_HUMAN);
}

describe("buildBundle", () => {
  it("emits a file per concept and an index.md per directory including the root", () => {
    const bundle = bundleFrom(`
      "An ISO country."
      type Country { code: ID! }
      type Query { countries: [Country!]! }
    `);

    expect(bundle.has("types/objects/Country.md")).toBe(true);
    expect(bundle.has("queries/countries.md")).toBe(true);
    expect(bundle.has("index.md")).toBe(true);
    expect(bundle.has("types/index.md")).toBe(true);
    expect(bundle.has("types/objects/index.md")).toBe(true);
    expect(bundle.has("queries/index.md")).toBe(true);
  });

  it("lists child directories in a grouping index and concepts in a leaf index", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(assembled(bundle, "index.md")).toContain("- [types/](types/index.md)");
    expect(assembled(bundle, "index.md")).toContain("- [queries/](queries/index.md)");
    expect(assembled(bundle, "types/index.md")).toContain("- [scalars/](scalars/index.md)");
    expect(assembled(bundle, "types/scalars/index.md")).toContain("- [String](String.md)");
  });

  it("uses a structural fallback summary when a concept has no description", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(assembled(bundle, "queries/index.md")).toContain(
      "- [hello](hello.md) — Query operation.",
    );
  });

  it("is deterministic: same input and timestamp yields identical output", () => {
    const sdl = "type Country { code: ID! } type Query { countries: [Country!]! }";
    expect(bundleFrom(sdl)).toEqual(bundleFrom(sdl));
  });

  it("has referential integrity: every intra-bundle link resolves to a real path", () => {
    const bundle = bundleFrom(`
      interface Node { id: ID! }
      type Country implements Node { id: ID! continent: Continent! }
      type Continent { code: ID! }
      type Query { countries: [Country!]! }
    `);
    const linkPattern = /\]\(([^)]+)\)/g;
    for (const [fromPath, parts] of bundle) {
      const contents = assembleFile(parts, EMPTY_HUMAN);
      for (const match of contents.matchAll(linkPattern)) {
        const target = match[1] ?? "";
        if (
          target.startsWith("http://") ||
          target.startsWith("https://") ||
          target.startsWith("<")
        ) {
          continue;
        }
        const resolved = new URL(target, `file:///${fromPath}`).pathname.slice(1);
        expect(bundle.has(resolved), `${fromPath} -> ${target} (${resolved})`).toBe(true);
      }
    }
  });
});

describe("buildBundle with tombstones", () => {
  it("lists a tombstoned concept in its directory index, marked removed", () => {
    const bundle = buildBundle(irWithOneObject, "2026-07-24T00:00:00.000Z", [
      { path: "types/objects/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    const index = bundle.get("types/objects/index.md");
    expect(index?.generated).toContain("- [LegacyOrder](LegacyOrder.md) — (removed)");
  });

  it("keeps a directory index alive when only tombstones remain in it", () => {
    const bundle = buildBundle(irWithNoInputs, "2026-07-24T00:00:00.000Z", [
      { path: "types/inputs/OldInput.md", title: "OldInput" },
    ]);

    expect(bundle.get("types/inputs/index.md")?.generated).toContain(
      "- [OldInput](OldInput.md) — (removed)",
    );
    expect(bundle.get("types/index.md")?.generated).toContain("- [inputs/](inputs/index.md)");
  });

  it("does not write a concept file for a tombstone", () => {
    const bundle = buildBundle(irWithOneObject, "2026-07-24T00:00:00.000Z", [
      { path: "types/objects/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    expect(bundle.has("types/objects/LegacyOrder.md")).toBe(false);
  });
});
