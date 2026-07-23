import { describe, expect, it } from "vitest";
import type {
  EnumTypeNode,
  InputObjectTypeNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  ScalarTypeNode,
  TypeRef,
  UnionTypeNode,
} from "../../model/ir.js";
import {
  renderEnumBody,
  renderInputBody,
  renderInterfaceBody,
  renderObjectBody,
  renderScalarBody,
  renderUnionBody,
} from "./body.js";

const scalarRef = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/scalars/${name}.md`,
  wrappers,
});

const country: ObjectTypeNode = {
  kind: "object",
  name: "Country",
  path: "types/objects/Country.md",
  description: "An ISO country.",
  appliedDirectives: [],
  interfaces: [{ name: "Node", path: "types/interfaces/Node.md", wrappers: [] }],
  fields: [
    {
      name: "code",
      description: "The ISO code.",
      type: scalarRef("ID", ["nonNull"]),
      args: [],
      deprecation: null,
      appliedDirectives: [],
    },
    {
      name: "phone",
      description: null,
      type: scalarRef("String"),
      args: [
        {
          name: "code",
          description: "Calling code.",
          type: scalarRef("String", ["nonNull"]),
          defaultValue: '"+1"',
          deprecation: null,
          appliedDirectives: [],
        },
      ],
      deprecation: { reason: "use dialCode" },
      appliedDirectives: [],
    },
  ],
};

describe("renderObjectBody", () => {
  it("renders heading, description, implements, and fields with linked types", () => {
    const out = renderObjectBody(country);
    expect(out).toContain("# Country");
    expect(out).toContain("An ISO country.");
    expect(out).toContain("Implements [`Node`](../interfaces/Node.md).");
    expect(out).toContain("- **`code`** — [`ID!`](../scalars/ID.md) — The ISO code.");
    expect(out).toContain(
      "- **`phone`** — [`String`](../scalars/String.md) (deprecated: use dialCode)",
    );
    expect(out).toContain(
      '  - Argument **`code`**: [`String!`](../scalars/String.md) = `"+1"` — Calling code.',
    );
  });
});

describe("renderInterfaceBody", () => {
  it("adds an implemented-by line", () => {
    const node: InterfaceTypeNode = {
      kind: "interface",
      name: "Node",
      path: "types/interfaces/Node.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [{ name: "Country", path: "types/objects/Country.md", wrappers: [] }],
      fields: [
        {
          name: "id",
          description: null,
          type: scalarRef("ID", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    };
    const out = renderInterfaceBody(node);
    expect(out).toContain("# Node");
    expect(out).toContain("Implemented by [`Country`](../objects/Country.md).");
    expect(out).toContain("- **`id`** — [`ID!`](../scalars/ID.md)");
  });
});

describe("renderUnionBody", () => {
  it("lists member types as links", () => {
    const node: UnionTypeNode = {
      kind: "union",
      name: "SearchResult",
      path: "types/unions/SearchResult.md",
      description: null,
      appliedDirectives: [],
      members: [
        { name: "Country", path: "types/objects/Country.md", wrappers: [] },
        { name: "Continent", path: "types/objects/Continent.md", wrappers: [] },
      ],
    };
    const out = renderUnionBody(node);
    expect(out).toContain("## Members");
    expect(out).toContain("- [`Country`](../objects/Country.md)");
    expect(out).toContain("- [`Continent`](../objects/Continent.md)");
  });
});

describe("renderEnumBody", () => {
  it("lists values with descriptions and deprecation", () => {
    const node: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: "Access level.",
      appliedDirectives: [],
      values: [
        { name: "ADMIN", description: null, deprecation: null, appliedDirectives: [] },
        { name: "OWNER", description: "Full access.", deprecation: null, appliedDirectives: [] },
        {
          name: "VIEWER",
          description: null,
          deprecation: { reason: "use READER" },
          appliedDirectives: [],
        },
      ],
    };
    const out = renderEnumBody(node);
    expect(out).toContain("## Values");
    expect(out).toContain("- **`ADMIN`**");
    expect(out).toContain("- **`OWNER`** — Full access.");
    expect(out).toContain("- **`VIEWER`** (deprecated: use READER)");
  });
});

describe("renderInputBody", () => {
  it("lists input fields with defaults", () => {
    const node: InputObjectTypeNode = {
      kind: "input",
      name: "LanguageFilterInput",
      path: "types/inputs/LanguageFilterInput.md",
      description: null,
      appliedDirectives: [],
      fields: [
        {
          name: "limit",
          description: null,
          type: { name: "Int", path: "types/scalars/Int.md", wrappers: [] },
          defaultValue: "10",
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    };
    const out = renderInputBody(node);
    expect(out).toContain("## Fields");
    expect(out).toContain("- **`limit`**: [`Int`](../scalars/Int.md) = `10`");
  });
});

describe("renderScalarBody", () => {
  it("notes a custom scalar and its specifiedBy url", () => {
    const node: ScalarTypeNode = {
      kind: "scalar",
      name: "DateTime",
      path: "types/scalars/DateTime.md",
      description: "An ISO-8601 timestamp.",
      appliedDirectives: [],
      specifiedByUrl: "https://scalars.test/datetime",
      isBuiltIn: false,
    };
    const out = renderScalarBody(node);
    expect(out).toContain("# DateTime");
    expect(out).toContain("An ISO-8601 timestamp.");
    expect(out).toContain("Custom scalar. Specified by <https://scalars.test/datetime>.");
  });

  it("notes a built-in scalar", () => {
    const node: ScalarTypeNode = {
      kind: "scalar",
      name: "String",
      path: "types/scalars/String.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
      isBuiltIn: true,
    };
    expect(renderScalarBody(node)).toContain("Built-in GraphQL scalar.");
  });
});
