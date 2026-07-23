import { describe, expect, it } from "vitest";
import type { InterfaceTypeNode, ObjectTypeNode, TypeRef } from "../../model/ir.js";
import { renderInterfaceBody, renderObjectBody } from "./body.js";

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
