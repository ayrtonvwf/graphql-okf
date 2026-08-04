import { describe, expect, it } from "vitest";
import type { InterfaceTypeNode, ObjectTypeNode, OperationNode, TypeRef } from "../../model/ir.js";
import { renderBody } from "./body.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const customer: ObjectTypeNode = {
  kind: "object",
  name: "Customer",
  path: "types/Customer.md",
  description: "A person who can place orders.\n\nNever hard-deleted.",
  appliedDirectives: [],
  interfaces: [ref("Node")],
  fields: [
    {
      name: "defaultAddress",
      description: "Where orders ship.",
      type: ref("Address"),
      args: [],
      deprecation: null,
      appliedDirectives: [],
    },
  ],
};

describe("renderBody", () => {
  it("renders heading, description, a fenced SDL block, and the references line", () => {
    expect(renderBody(customer)).toBe(
      [
        "# Customer",
        "",
        "A person who can place orders.",
        "",
        "Never hard-deleted.",
        "",
        "# Schema",
        "",
        "```graphql",
        "type Customer implements Node {",
        '  "Where orders ship."',
        "  defaultAddress: Address",
        "}",
        "```",
        "",
        "References: [`Address`](/types/Address.md), [`Node`](/types/Node.md).",
        "",
      ].join("\n"),
    );
  });

  it("emits no markdown table anywhere", () => {
    expect(renderBody(customer)).not.toContain("| --- |");
  });

  it("omits the description block when a concept has no docstring", () => {
    const bare: ObjectTypeNode = { ...customer, description: null, interfaces: [], fields: [] };

    expect(renderBody(bare)).toBe(
      ["# Customer", "", "# Schema", "", "```graphql", "type Customer", "```", ""].join("\n"),
    );
  });

  it("keeps the reverse implemented-by edge, which SDL cannot express", () => {
    const timestamped: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [ref("Customer"), ref("Order")],
      fields: [],
    };

    expect(renderBody(timestamped)).toContain(
      "Implemented by [`Customer`](/types/Customer.md), [`Order`](/types/Order.md).",
    );
  });

  it("titles a directive with its sigil", () => {
    const auth = {
      kind: "directive" as const,
      name: "auth",
      path: "directives/auth.md",
      description: null,
      appliedDirectives: [],
      locations: ["FIELD_DEFINITION"],
      args: [],
      isRepeatable: false,
    };

    expect(renderBody(auth)).toContain("# @auth");
  });

  it("states an operation's deprecation inside the block, not above it", () => {
    const legacy: OperationNode = {
      kind: "query",
      name: "legacy",
      path: "queries/legacy.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [],
      type: ref("Order"),
      deprecation: { reason: "Use orders." },
    };

    expect(renderBody(legacy)).toContain('legacy: Order @deprecated(reason: "Use orders.")');
    expect(renderBody(legacy)).not.toContain("**Deprecated");
  });
});
