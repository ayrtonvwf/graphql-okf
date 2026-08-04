import { describe, expect, it } from "vitest";
import type {
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  TypeRef,
} from "../../model/ir.js";
import { referencesLine } from "./references.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

/** A spec-defined element: no concept file, so no link (issue #23). */
const builtIn = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: null,
  wrappers,
});

const object = (over: Partial<ObjectTypeNode> = {}): ObjectTypeNode => ({
  kind: "object",
  name: "Customer",
  path: "types/Customer.md",
  description: null,
  appliedDirectives: [],
  interfaces: [],
  fields: [],
  ...over,
});

describe("referencesLine", () => {
  it("is empty when a concept links to nothing", () => {
    expect(referencesLine(object())).toEqual([]);
  });

  it("names field types, interfaces, and applied directives, alphabetically", () => {
    const customer = object({
      interfaces: [ref("Timestamped"), ref("Node")],
      fields: [
        {
          name: "email",
          description: null,
          type: ref("EmailAddress", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [
            {
              name: "auth",
              path: "directives/auth.md",
              args: [{ name: "requires", value: "STAFF" }],
            },
          ],
        },
        {
          name: "defaultAddress",
          description: null,
          type: ref("Address"),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual([
      "",
      "References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), " +
        "[`EmailAddress`](/types/EmailAddress.md), [`Node`](/types/Node.md), " +
        "[`Timestamped`](/types/Timestamped.md).",
    ]);
  });

  it("names each target once however often it appears", () => {
    const customer = object({
      fields: [
        {
          name: "createdAt",
          description: null,
          type: ref("DateTime", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
        {
          name: "updatedAt",
          description: null,
          type: ref("DateTime"),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual(["", "References: [`DateTime`](/types/DateTime.md)."]);
  });

  it("omits spec-defined elements, which have no concept file", () => {
    const customer = object({
      fields: [
        {
          name: "id",
          description: null,
          type: builtIn("ID", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [{ name: "deprecated", path: null, args: [] }],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual([]);
  });

  it("reaches argument types", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [
        {
          name: "filter",
          description: null,
          type: ref("ProductFilter"),
          defaultValue: null,
          deprecation: null,
          appliedDirectives: [],
        },
      ],
      type: ref("Product", ["nonNull", "list", "nonNull"]),
      deprecation: null,
    };

    expect(referencesLine(products)).toEqual([
      "",
      "References: [`Product`](/types/Product.md), [`ProductFilter`](/types/ProductFilter.md).",
    ]);
  });

  it("excludes the reverse implemented-by edge", () => {
    const timestamped: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [ref("Customer")],
      fields: [],
    };

    expect(referencesLine(timestamped)).toEqual([]);
  });

  it("is empty for a scalar that applies nothing", () => {
    const email: ScalarTypeNode = {
      kind: "scalar",
      name: "EmailAddress",
      path: "types/EmailAddress.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: "https://example.com/email",
    };

    expect(referencesLine(email)).toEqual([]);
  });
});
