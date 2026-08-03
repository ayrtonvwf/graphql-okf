import { createHash } from "node:crypto";
import { buildSchema, isScalarType, isSpecifiedDirective, isSpecifiedScalarType } from "graphql";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_BY_KIND,
  elementId,
  hasConceptFile,
  KIND_ORDER,
  resolvePaths,
  SPEC_DEFINED_PATHS,
  TYPE_LABEL_BY_KIND,
} from "./naming.js";

describe("DIRECTORY_BY_KIND", () => {
  it("maps every concept kind to its documented directory", () => {
    expect(DIRECTORY_BY_KIND).toEqual({
      object: "types",
      interface: "types",
      union: "types",
      enum: "types",
      input: "types",
      scalar: "types",
      query: "queries",
      mutation: "mutations",
      subscription: "subscriptions",
      directive: "directives",
    });
  });
});

describe("TYPE_LABEL_BY_KIND", () => {
  it("gives every kind a descriptive Title Case label", () => {
    expect(TYPE_LABEL_BY_KIND).toEqual({
      object: "GraphQL Object Type",
      interface: "GraphQL Interface Type",
      union: "GraphQL Union Type",
      enum: "GraphQL Enum Type",
      input: "GraphQL Input Type",
      scalar: "GraphQL Scalar Type",
      query: "GraphQL Query",
      mutation: "GraphQL Mutation",
      subscription: "GraphQL Subscription",
      directive: "GraphQL Directive",
    });
  });

  it("covers exactly the kinds the naming scheme knows about", () => {
    expect(Object.keys(TYPE_LABEL_BY_KIND).sort()).toEqual(Object.keys(DIRECTORY_BY_KIND).sort());
  });
});

describe("KIND_ORDER", () => {
  it("lists every kind exactly once, types first in definitional weight", () => {
    expect(KIND_ORDER).toEqual([
      "object",
      "interface",
      "union",
      "enum",
      "input",
      "scalar",
      "query",
      "mutation",
      "subscription",
      "directive",
    ]);
  });

  it("covers every key of DIRECTORY_BY_KIND", () => {
    expect([...KIND_ORDER].sort()).toEqual(Object.keys(DIRECTORY_BY_KIND).sort());
  });
});

describe("resolvePaths", () => {
  it("uses the exact GraphQL name as the filename", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "enum", name: "Role" },
      { kind: "query", name: "user" },
      { kind: "directive", name: "auth" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/User.md");
    expect(paths.get(elementId({ kind: "enum", name: "Role" }))).toBe("types/Role.md");
    expect(paths.get(elementId({ kind: "query", name: "user" }))).toBe("queries/user.md");
    expect(paths.get(elementId({ kind: "directive", name: "auth" }))).toBe("directives/auth.md");
  });

  it("does not suffix names that collide only across different directories", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "query", name: "User" },
      { kind: "directive", name: "User" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/User.md");
    expect(paths.get(elementId({ kind: "query", name: "User" }))).toBe("queries/User.md");
    expect(paths.get(elementId({ kind: "directive", name: "User" }))).toBe("directives/User.md");
  });

  it("returns one entry per input element", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "Post" },
    ]);

    expect(paths.size).toBe(2);
  });
});

function hashOf(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}

describe("resolvePaths collisions", () => {
  it("suffixes every member of a case-fold collision set", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe(
      `types/User-${hashOf("User")}.md`,
    );
    expect(paths.get(elementId({ kind: "object", name: "user" }))).toBe(
      `types/user-${hashOf("user")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved index.md", () => {
    const paths = resolvePaths([{ kind: "object", name: "index" }]);

    expect(paths.get(elementId({ kind: "object", name: "index" }))).toBe(
      `types/index-${hashOf("index")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved log.md, case-insensitively", () => {
    const paths = resolvePaths([{ kind: "query", name: "Log" }]);

    expect(paths.get(elementId({ kind: "query", name: "Log" }))).toBe(
      `queries/Log-${hashOf("Log")}.md`,
    );
  });

  it("is independent of input order", () => {
    const elements: { kind: "object"; name: string }[] = [
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "object", name: "Post" },
      { kind: "object", name: "index" },
      { kind: "object", name: "Comment" },
    ];
    const forward = resolvePaths(elements);
    const reversed = resolvePaths([...elements].reverse());

    for (const element of elements) {
      expect(reversed.get(elementId(element))).toBe(forward.get(elementId(element)));
    }
  });

  it("does not suffix a name merely because another directory has a collision", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "query", name: "User" },
    ]);

    expect(paths.get(elementId({ kind: "query", name: "User" }))).toBe("queries/User.md");
  });
});

describe("the flattened types directory", () => {
  it("puts every type kind directly under types/", () => {
    const paths = resolvePaths([
      { kind: "object", name: "Product" },
      { kind: "interface", name: "Node" },
      { kind: "union", name: "PaymentMethod" },
      { kind: "enum", name: "Currency" },
      { kind: "input", name: "ProductFilter" },
      { kind: "scalar", name: "DateTime" },
    ]);

    expect(paths.get("object:Product")).toBe("types/Product.md");
    expect(paths.get("interface:Node")).toBe("types/Node.md");
    expect(paths.get("union:PaymentMethod")).toBe("types/PaymentMethod.md");
    expect(paths.get("enum:Currency")).toBe("types/Currency.md");
    expect(paths.get("input:ProductFilter")).toBe("types/ProductFilter.md");
    expect(paths.get("scalar:DateTime")).toBe("types/DateTime.md");
  });

  it("leaves operations and directives where they are", () => {
    const paths = resolvePaths([
      { kind: "query", name: "product" },
      { kind: "mutation", name: "placeOrder" },
      { kind: "subscription", name: "reviewPosted" },
      { kind: "directive", name: "auth" },
    ]);

    expect(paths.get("query:product")).toBe("queries/product.md");
    expect(paths.get("mutation:placeOrder")).toBe("mutations/placeOrder.md");
    expect(paths.get("subscription:reviewPosted")).toBe("subscriptions/reviewPosted.md");
    expect(paths.get("directive:auth")).toBe("directives/auth.md");
  });

  it("hashes a type and an input that differ only by case", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "input", name: "user" },
    ]);

    const object = paths.get("object:User");
    const input = paths.get("input:user");

    expect(object).toMatch(/^types\/User-[0-9a-f]{8}\.md$/);
    expect(input).toMatch(/^types\/user-[0-9a-f]{8}\.md$/);
    expect(object?.toLowerCase()).not.toBe(input?.toLowerCase());
  });

  it("hashes a type whose name is a reserved basename", () => {
    const paths = resolvePaths([{ kind: "enum", name: "Index" }]);

    expect(paths.get("enum:Index")).toMatch(/^types\/Index-[0-9a-f]{8}\.md$/);
  });

  it("does not hash a type and an operation sharing a case-folded name", () => {
    const paths = resolvePaths([
      { kind: "object", name: "Product" },
      { kind: "query", name: "product" },
    ]);

    expect(paths.get("object:Product")).toBe("types/Product.md");
    expect(paths.get("query:product")).toBe("queries/product.md");
  });
});

describe("hasConceptFile", () => {
  it("denies a concept file to every specified scalar and directive", () => {
    for (const name of ["Boolean", "Float", "ID", "Int", "String"]) {
      expect(hasConceptFile({ kind: "scalar", name })).toBe(false);
    }
    for (const name of ["deprecated", "include", "oneOf", "skip", "specifiedBy"]) {
      expect(hasConceptFile({ kind: "directive", name })).toBe(false);
    }
  });

  it("grants one to custom scalars, custom directives, and every other kind", () => {
    expect(hasConceptFile({ kind: "scalar", name: "DateTime" })).toBe(true);
    expect(hasConceptFile({ kind: "directive", name: "auth" })).toBe(true);
    // GraphQL names are case-sensitive: `type id` is not the built-in `ID`.
    expect(hasConceptFile({ kind: "object", name: "id" })).toBe(true);
    expect(hasConceptFile({ kind: "enum", name: "String" })).toBe(true);
    expect(hasConceptFile({ kind: "query", name: "skip" })).toBe(true);
  });

  it("agrees with graphql-js about what the specification defines", () => {
    const schema = buildSchema(`
      scalar DateTime
      directive @auth(role: String) on FIELD_DEFINITION
      type Query { at: DateTime, id: ID, n: Int, f: Float, s: String, b: Boolean }
    `);

    for (const type of Object.values(schema.getTypeMap())) {
      if (!isScalarType(type)) {
        continue;
      }
      expect(hasConceptFile({ kind: "scalar", name: type.name })).toBe(
        !isSpecifiedScalarType(type),
      );
    }

    for (const directive of schema.getDirectives()) {
      expect(hasConceptFile({ kind: "directive", name: directive.name })).toBe(
        !isSpecifiedDirective(directive),
      );
    }
  });
});

describe("SPEC_DEFINED_PATHS", () => {
  it("lists the ten paths spec-defined concepts occupied, sorted", () => {
    expect([...SPEC_DEFINED_PATHS]).toEqual([
      "directives/deprecated.md",
      "directives/include.md",
      "directives/oneOf.md",
      "directives/skip.md",
      "directives/specifiedBy.md",
      "types/Boolean.md",
      "types/Float.md",
      "types/ID.md",
      "types/Int.md",
      "types/String.md",
    ]);
  });
});
