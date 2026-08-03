import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { ObjectTypeNode, ScalarTypeNode, SchemaIr } from "../model/ir.js";
import { project } from "../model/project.js";
import type { LoadedSchema } from "../source/types.js";
import { buildBundle } from "./bundle.js";
import { emitContext } from "./context.js";
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
  return buildBundle(irFrom(sdl), emitContext("0.1", TS));
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

    expect(bundle.has("types/Country.md")).toBe(true);
    expect(bundle.has("queries/countries.md")).toBe(true);
    expect(bundle.has("index.md")).toBe(true);
    expect(bundle.has("types/index.md")).toBe(true);
    expect(bundle.has("queries/index.md")).toBe(true);
  });

  it("lists child directories in the root index and concepts in a leaf index", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(assembled(bundle, "index.md")).toContain("* [types/](/types/index.md)");
    expect(assembled(bundle, "index.md")).toContain("* [queries/](/queries/index.md)");
    expect(assembled(bundle, "types/index.md")).toContain("* [String](/types/String.md)");
  });

  it("groups a directory index by kind when it holds more than one kind", () => {
    const bundle = bundleFrom(`
      "An ISO country."
      type Country { code: ID! }
      type Query { countries: [Country!]! }
    `);

    expect(assembled(bundle, "types/index.md")).toContain("## Object types");
    expect(assembled(bundle, "types/index.md")).toContain(
      "* [Country](/types/Country.md) - An ISO country.",
    );
    expect(assembled(bundle, "types/index.md")).toContain("## Scalar types");
    expect(assembled(bundle, "types/index.md")).toContain(
      "* [ID](/types/ID.md) - The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache.",
    );
  });

  it("uses a structural fallback summary when a concept has no description", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [hello](/queries/hello.md) - Query operation.",
    );
  });

  it("summarizes an index entry with the concept's first sentence", () => {
    const bundle = buildBundle(
      {
        resource: "https://api.test/graphql",
        origin: "sdl",
        concepts: [
          {
            kind: "object",
            name: "Product",
            path: "types/Product.md",
            description: "A product\nspanning lines. More.",
            appliedDirectives: [],
            fields: [],
            interfaces: [],
          },
        ],
      },
      emitContext("0.1", "2026-07-25T00:00:00.000Z"),
    );

    expect(bundle.get("types/index.md")?.generated).toContain(
      "* [Product](/types/Product.md) - A product spanning lines.",
    );
  });

  it("is deterministic: same input and timestamp yields identical output", () => {
    const sdl = "type Country { code: ID! } type Query { countries: [Country!]! }";
    expect(bundleFrom(sdl)).toEqual(bundleFrom(sdl));
  });

  it("puts okf_version and the schema origin on the root index only", () => {
    const ir = irWithOneObject;
    const bundle = buildBundle(ir, emitContext("0.1", "2026-07-25T00:00:00.000Z"));

    expect(bundle.get("index.md")?.preamble).toContain('okf_version: "0.1"');
    expect(bundle.get("index.md")?.preamble).toContain(`resource: ${JSON.stringify(ir.resource)}`);
    expect(bundle.get("types/index.md")?.preamble).not.toContain("---");
  });

  it("declares the emitted okf_version on the bundle-root index", () => {
    const bundle = buildBundle(irWithOneObject, emitContext("0.2", TS));

    expect(bundle.get("index.md")?.preamble).toContain('okf_version: "0.2"');
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
    const bundle = buildBundle(irWithOneObject, emitContext("0.1", "2026-07-24T00:00:00.000Z"), [
      { path: "types/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    const index = bundle.get("types/index.md");
    expect(index?.generated).toContain("* [LegacyOrder](/types/LegacyOrder.md) - (removed)");
  });

  it("keeps a directory index alive when only tombstones remain in it", () => {
    const bundle = buildBundle(irWithNoInputs, emitContext("0.1", "2026-07-24T00:00:00.000Z"), [
      { path: "types/OldInput.md", title: "OldInput" },
    ]);

    expect(bundle.get("types/index.md")?.generated).toContain(
      "* [OldInput](/types/OldInput.md) - (removed)",
    );
    expect(bundle.get("types/index.md")?.generated).toContain("* [String](/types/String.md)");
  });

  it("does not write a concept file for a tombstone", () => {
    const bundle = buildBundle(irWithOneObject, emitContext("0.1", "2026-07-24T00:00:00.000Z"), [
      { path: "types/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    expect(bundle.has("types/LegacyOrder.md")).toBe(false);
  });
});

const MULTI_KIND_IR: SchemaIr = {
  resource: "test.graphql",
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
    } satisfies ObjectTypeNode,
    {
      kind: "scalar",
      name: "ID",
      path: "types/ID.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
      isBuiltIn: true,
    } satisfies ScalarTypeNode,
  ],
};

describe("an index for a directory holding more than one kind", () => {
  it("groups its concepts under a heading per kind, in KIND_ORDER", () => {
    const bundle = buildBundle(MULTI_KIND_IR, emitContext("0.2", TS));

    expect(assembled(bundle, "types/index.md")).toContain(
      [
        "## Object types",
        "",
        "* [Country](/types/Country.md) - An ISO country.",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md) - Scalar type.",
      ].join("\n"),
    );
  });

  it("puts tombstones in a trailing Removed section", () => {
    const bundle = buildBundle(MULTI_KIND_IR, emitContext("0.2", TS), [
      { path: "types/GiftCard.md", title: "GiftCard" },
    ]);
    const index = assembled(bundle, "types/index.md");

    expect(index).toContain("## Removed\n\n* [GiftCard](/types/GiftCard.md) - (removed)");
    expect(index.indexOf("## Removed")).toBeGreaterThan(index.indexOf("## Scalar types"));
  });

  it("leaves a single-kind directory as a flat list", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    expect(assembled(bundle, "queries/index.md")).not.toContain("## ");
  });
});
