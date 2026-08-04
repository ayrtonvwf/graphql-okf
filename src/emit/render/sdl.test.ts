import { parse } from "graphql";
import { describe, expect, it } from "vitest";

import type {
  DirectiveDefinitionNode,
  EnumTypeNode,
  FieldNode,
  InputObjectTypeNode,
  InputValueNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  TypeRef,
  UnionTypeNode,
} from "../../model/ir.js";
import {
  appliedSdl,
  argumentLines,
  deprecatedSdl,
  docstringLines,
  fieldLines,
  inlineArgumentList,
  sdlBlock,
  sdlString,
} from "./sdl.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const arg = (over: Partial<InputValueNode> = {}): InputValueNode => ({
  name: "first",
  description: null,
  type: ref("Int"),
  defaultValue: null,
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

const field = (over: Partial<FieldNode> = {}): FieldNode => ({
  name: "products",
  description: null,
  type: ref("Product", ["nonNull", "list", "nonNull"]),
  args: [],
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

describe("sdlString", () => {
  it("uses a single-quoted string for a plain one-liner", () => {
    expect(sdlString("Where orders ship.")).toBe('"Where orders ship."');
  });

  it("uses a block string when the text spans lines", () => {
    expect(sdlString("One.\nTwo.")).toBe('"""\nOne.\nTwo.\n"""');
  });

  it("uses a block string when the text holds a quote", () => {
    expect(sdlString('Say "hi".')).toBe('"""\nSay "hi".\n"""');
  });

  it("uses a block string when the text holds a backslash", () => {
    expect(sdlString("A\\B")).toBe('"""\nA\\B\n"""');
  });

  it("escapes a triple quote inside a block string", () => {
    expect(sdlString('a """ b\nc')).toBe('"""\na \\""" b\nc\n"""');
  });
});

describe("docstringLines", () => {
  it("is empty for a missing description", () => {
    expect(docstringLines(null, "  ")).toEqual([]);
  });

  it("indents every line of a block string", () => {
    expect(docstringLines("One.\nTwo.", "  ")).toEqual(['  """', "  One.", "  Two.", '  """']);
  });
});

describe("appliedSdl", () => {
  it("is empty when nothing is applied", () => {
    expect(appliedSdl([])).toBe("");
  });

  it("prints each directive with its arguments, leading space included", () => {
    expect(
      appliedSdl([
        { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: "STAFF" }] },
        { name: "tag", path: "directives/tag.md", args: [] },
      ]),
    ).toBe(" @auth(requires: STAFF) @tag");
  });
});

describe("deprecatedSdl", () => {
  it("is empty when not deprecated", () => {
    expect(deprecatedSdl(null)).toBe("");
  });

  it("prints a bare @deprecated when there is no reason", () => {
    expect(deprecatedSdl({ reason: null })).toBe(" @deprecated");
  });

  it("prints the reason as an SDL string", () => {
    expect(deprecatedSdl({ reason: "Use email." })).toBe(' @deprecated(reason: "Use email.")');
  });
});

describe("inlineArgumentList", () => {
  it("is empty for no arguments, since SDL has no empty parens", () => {
    expect(inlineArgumentList([])).toBe("");
  });

  it("prints names, types, and defaults on one line", () => {
    expect(inlineArgumentList([arg(), arg({ name: "after", type: ref("String") })])).toBe(
      "(first: Int, after: String)",
    );
  });

  it("prints a default value", () => {
    expect(inlineArgumentList([arg({ defaultValue: "20" })])).toBe("(first: Int = 20)");
  });
});

describe("argumentLines", () => {
  it("stays inline when no argument is described", () => {
    expect(argumentLines([arg({ defaultValue: "20" })], "  ")).toEqual(["(first: Int = 20)"]);
  });

  it("breaks across lines when any argument is described", () => {
    expect(
      argumentLines([arg({ description: "How many." }), arg({ name: "after" })], "  "),
    ).toEqual(["(", '    "How many."', "    first: Int", "    after: Int", "  )"]);
  });
});

describe("fieldLines", () => {
  it("prints a bare field", () => {
    expect(fieldLines(field(), "  ")).toEqual(["  products: [Product!]!"]);
  });

  it("prints description, arguments, directives, and deprecation together", () => {
    expect(
      fieldLines(
        field({
          description: "Lists products.",
          args: [arg({ defaultValue: "20" })],
          deprecation: { reason: "Use search." },
          appliedDirectives: [{ name: "auth", path: "directives/auth.md", args: [] }],
        }),
        "  ",
      ),
    ).toEqual([
      '  "Lists products."',
      '  products(first: Int = 20): [Product!]! @auth @deprecated(reason: "Use search.")',
    ]);
  });
});

describe("sdlBlock", () => {
  it("prints an object with its interfaces, fields, and applied directives", () => {
    const customer: ObjectTypeNode = {
      kind: "object",
      name: "Customer",
      path: "types/Customer.md",
      description: "A person who can place orders.",
      appliedDirectives: [{ name: "key", path: "directives/key.md", args: [] }],
      interfaces: [ref("Node"), ref("Timestamped")],
      fields: [
        field({ name: "id", type: ref("ID", ["nonNull"]) }),
        field({
          name: "email",
          type: ref("EmailAddress", ["nonNull"]),
          appliedDirectives: [
            {
              name: "auth",
              path: "directives/auth.md",
              args: [{ name: "requires", value: "STAFF" }],
            },
          ],
        }),
      ],
    };

    expect(sdlBlock(customer)).toEqual([
      "type Customer implements Node & Timestamped @key {",
      "  id: ID!",
      "  email: EmailAddress! @auth(requires: STAFF)",
      "}",
    ]);
  });

  it("prints a member-less type as a header alone, since empty braces are not SDL", () => {
    const empty: ObjectTypeNode = {
      kind: "object",
      name: "Empty",
      path: "types/Empty.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [],
    };

    expect(sdlBlock(empty)).toEqual(["type Empty"]);
  });

  it("prints an interface", () => {
    const node: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [ref("Node")],
      implementedBy: [ref("Customer")],
      fields: [field({ name: "createdAt", type: ref("DateTime", ["nonNull"]) })],
    };

    expect(sdlBlock(node)).toEqual([
      "interface Timestamped implements Node {",
      "  createdAt: DateTime!",
      "}",
    ]);
  });

  it("prints an input object with defaults and docstrings", () => {
    const input: InputObjectTypeNode = {
      kind: "input",
      name: "PlaceOrderInput",
      path: "types/PlaceOrderInput.md",
      description: null,
      appliedDirectives: [],
      fields: [
        arg({ name: "quantity", description: "How many.", defaultValue: "1" }),
        arg({ name: "note", type: ref("String") }),
      ],
    };

    expect(sdlBlock(input)).toEqual([
      "input PlaceOrderInput {",
      '  "How many."',
      "  quantity: Int = 1",
      "  note: String",
      "}",
    ]);
  });

  it("prints an enum with descriptions and deprecation", () => {
    const role: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        { name: "CUSTOMER", description: "A shopper.", deprecation: null, appliedDirectives: [] },
        {
          name: "GUEST",
          description: null,
          deprecation: { reason: "Use CUSTOMER." },
          appliedDirectives: [],
        },
      ],
    };

    expect(sdlBlock(role)).toEqual([
      "enum Role {",
      '  "A shopper."',
      "  CUSTOMER",
      '  GUEST @deprecated(reason: "Use CUSTOMER.")',
      "}",
    ]);
  });

  it("prints a union on one line", () => {
    const payment: UnionTypeNode = {
      kind: "union",
      name: "PaymentMethod",
      path: "types/PaymentMethod.md",
      description: null,
      appliedDirectives: [],
      members: [ref("Card"), ref("PayPalAccount")],
    };

    expect(sdlBlock(payment)).toEqual(["union PaymentMethod = Card | PayPalAccount"]);
  });

  it("prints a scalar with its specifiedBy url", () => {
    const email: ScalarTypeNode = {
      kind: "scalar",
      name: "EmailAddress",
      path: "types/EmailAddress.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: "https://example.com/email",
    };

    expect(sdlBlock(email)).toEqual([
      'scalar EmailAddress @specifiedBy(url: "https://example.com/email")',
    ]);
  });

  it("prints an operation as a field definition", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [arg({ name: "first", defaultValue: "20" })],
      type: ref("Product", ["nonNull", "list", "nonNull"]),
      deprecation: null,
    };

    expect(sdlBlock(products)).toEqual(["products(first: Int = 20): [Product!]!"]);
  });

  it("prints a directive definition with its locations", () => {
    const auth: DirectiveDefinitionNode = {
      kind: "directive",
      name: "auth",
      path: "directives/auth.md",
      description: null,
      appliedDirectives: [],
      locations: ["FIELD_DEFINITION", "OBJECT"],
      args: [arg({ name: "requires", type: ref("Role", ["nonNull"]), defaultValue: "CUSTOMER" })],
      isRepeatable: true,
    };

    expect(sdlBlock(auth)).toEqual([
      "directive @auth(requires: Role! = CUSTOMER) repeatable on FIELD_DEFINITION | OBJECT",
    ]);
  });
});

describe("sdlBlock output parses as GraphQL", () => {
  const wrap = (lines: readonly string[]): string => {
    const text = lines.join("\n");
    return /^(type|interface|input|enum|union|scalar|directive)\b/.test(text)
      ? text
      : `type Wrapper {\n${text}\n}`;
  };

  it("parses a field with a described argument", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [arg({ name: "first", description: "How many.", defaultValue: "20" })],
      type: ref("Product"),
      deprecation: null,
    };

    expect(() => parse(wrap(sdlBlock(products)))).not.toThrow();
  });

  it("parses a description containing quotes and newlines", () => {
    const weird: ObjectTypeNode = {
      kind: "object",
      name: "Weird",
      path: "types/Weird.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [field({ name: "a", description: 'Say "hi".\n\nAnd \\ this.', type: ref("String") })],
    };

    expect(() => parse(wrap(sdlBlock(weird)))).not.toThrow();
    expect(parse(wrap(sdlBlock(weird))).definitions).toHaveLength(1);
  });
});
