import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { ObjectTypeNode, ScalarTypeNode, SchemaIr } from "../model/ir.js";
import { project } from "../model/project.js";
import type { LoadedSchema } from "../source/types.js";
import { buildBundle, SEAM_NOTE, SIGNATURE_NOTE, SPEC_DEFINED_NOTE } from "./bundle.js";
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
    const bundle = bundleFrom("scalar Slug\ntype Query { hello: Slug }");
    expect(assembled(bundle, "index.md")).toContain("* [types/](/types/index.md)");
    expect(assembled(bundle, "index.md")).toContain("* [queries/](/queries/index.md)");
    expect(assembled(bundle, "types/index.md")).toContain("* [Slug](/types/Slug.md)");
  });

  it("groups a directory index by kind when it holds more than one kind", () => {
    const bundle = bundleFrom(`
      "An ISO 3166-1 alpha-2 code."
      scalar CountryCode
      "An ISO country."
      type Country { code: CountryCode! }
      type Query { countries: [Country!]! }
    `);

    expect(assembled(bundle, "types/index.md")).toContain("## Object types");
    expect(assembled(bundle, "types/index.md")).toContain(
      "* [Country](/types/Country.md) - An ISO country.",
    );
    expect(assembled(bundle, "types/index.md")).toContain("## Scalar types");
    expect(assembled(bundle, "types/index.md")).toContain(
      "* [CountryCode](/types/CountryCode.md) - An ISO 3166-1 alpha-2 code.",
    );
  });

  it("uses a structural fallback summary when a concept has no description", () => {
    const bundle = bundleFrom("type Query { hello: String }");
    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [`hello: String`](/queries/hello.md) - Query operation.",
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

  it("carries an SDL signature as the link label on an operation row", () => {
    const bundle = bundleFrom(`
      input ProductFilter { term: String }
      type Product { id: ID! }
      type Query {
        "Lists products."
        products(filter: ProductFilter, first: Int = 20): [Product!]!
      }
    `);

    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products.",
    );
  });

  it("carries an SDL signature on a directive row", () => {
    const bundle = bundleFrom(`
      "Restricts a field."
      directive @auth(requires: String! = "CUSTOMER") on FIELD_DEFINITION | OBJECT
      type Query { hello: String }
    `);

    expect(assembled(bundle, "directives/index.md")).toContain(
      '* [`@auth(requires: String! = "CUSTOMER") on FIELD_DEFINITION | OBJECT`](/directives/auth.md) - Restricts a field.',
    );
  });

  it("marks a deprecated operation on its index row", () => {
    const bundle = bundleFrom(`
      type Query {
        "An old field."
        legacy: String @deprecated(reason: "Use hello.")
        hello: String
      }
    `);

    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [`legacy: String`](/queries/legacy.md) - **(deprecated)** An old field.",
    );
  });

  it("puts the signature convention note on an index that carries signatures", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    expect(assembled(bundle, "queries/index.md")).toContain(SIGNATURE_NOTE);
  });

  it("leaves the type index without a signature note and without signatures", () => {
    const bundle = bundleFrom(`
      "An ISO country."
      type Country { code: ID! }
      type Query { countries: [Country!]! }
    `);

    const types = assembled(bundle, "types/index.md");
    expect(types).not.toContain(SIGNATURE_NOTE);
    expect(types).toContain("* [Country](/types/Country.md) - An ISO country.");
  });

  it("keeps the root index note about spec-defined elements", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    const root = assembled(bundle, "index.md");
    expect(root).toContain(SPEC_DEFINED_NOTE);
    expect(root).not.toContain(SIGNATURE_NOTE);
  });

  it("orders operation rows by name, not by rendered signature", () => {
    const bundle = bundleFrom(`
      type Query {
        product(id: ID!): String
        products: String
        me: String
      }
    `);

    const names = assembled(bundle, "queries/index.md")
      .split("\n")
      .filter((line) => line.startsWith("* ["))
      .map((line) =>
        line.slice(line.indexOf("](/queries/") + "](/queries/".length, line.indexOf(".md)")),
      );

    expect(names).toEqual(["me", "product", "products"]);
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

  it("materializes a directory index for a directory holding nothing but tombstones", () => {
    const bundle = buildBundle(irWithOneObject, emitContext("0.1", "2026-07-24T00:00:00.000Z"), [
      { path: "mutations/OldThing.md", title: "OldThing" },
    ]);

    expect(bundle.get("mutations/index.md")?.generated).toContain(
      "* [OldThing](/mutations/OldThing.md) - (removed)",
    );
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
      name: "Slug",
      path: "types/Slug.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
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
        "* [Slug](/types/Slug.md) - Scalar type.",
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

describe("the built-in convention note", () => {
  const ir = {
    resource: "https://x.example/graphql",
    origin: "sdl" as const,
    concepts: [
      {
        kind: "object" as const,
        name: "Product",
        path: "types/Product.md",
        description: null,
        appliedDirectives: [],
        interfaces: [],
        fields: [],
      },
    ],
  };

  it("states the convention on the bundle root index only", () => {
    const bundle = buildBundle(ir, emitContext("0.2", "2026-08-03T00:00:00.000Z"));

    expect(bundle.get("index.md")?.generated).toContain(SPEC_DEFINED_NOTE);
    expect(bundle.get("types/index.md")?.generated).not.toContain(SPEC_DEFINED_NOTE);
  });

  it("puts the generated-region convention on the bundle root index (issue #24)", () => {
    const bundle = buildBundle(ir, emitContext("0.2", TS));
    const root = bundle.get("index.md");

    expect(root?.generated).toContain(SEAM_NOTE);
    expect(root?.generated).toContain(SPEC_DEFINED_NOTE);
  });

  it("puts it on the root index only", () => {
    const bundle = buildBundle(ir, emitContext("0.2", TS));

    for (const [path, parts] of bundle) {
      if (path !== "index.md") {
        expect(parts.generated, `${path} should not repeat the seam note`).not.toContain(SEAM_NOTE);
      }
    }
  });
});
