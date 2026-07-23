import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { project } from "../model/project.js";
import type { LoadedSchema } from "../source/types.js";
import { buildBundle } from "./bundle.js";

const TS = "2026-07-23T12:00:00.000Z";

function bundleFrom(sdl: string): ReadonlyMap<string, string> {
  const loaded: LoadedSchema = {
    schema: buildSchema(sdl),
    resource: "test.graphql",
    origin: "sdl",
  };
  return buildBundle(project(loaded), TS);
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
    expect(bundle.get("index.md")).toContain("- [types/](types/index.md)");
    expect(bundle.get("index.md")).toContain("- [queries/](queries/index.md)");
    expect(bundle.get("types/index.md")).toContain("- [scalars/](scalars/index.md)");
    expect(bundle.get("types/scalars/index.md")).toContain("- [String](String.md)");
  });

  it("uses a structural fallback summary when a concept has no description", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(bundle.get("queries/index.md")).toContain("- [hello](hello.md) — Query operation.");
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
    for (const [fromPath, contents] of bundle) {
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
