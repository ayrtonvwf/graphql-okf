import { describe, expect, it } from "vitest";
import type {
  DirectiveDefinitionNode,
  InputValueNode,
  OperationNode,
  TypeRef,
} from "../../model/ir.js";
import { directiveSignature, operationSignature } from "./signature.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const arg = (name: string, type: TypeRef, defaultValue: string | null = null): InputValueNode => ({
  name,
  description: null,
  type,
  defaultValue,
  deprecation: null,
  appliedDirectives: [],
});

const operation = (
  name: string,
  args: readonly InputValueNode[],
  type: TypeRef,
): OperationNode => ({
  kind: "query",
  name,
  path: `queries/${name}.md`,
  description: null,
  appliedDirectives: [],
  rootTypeName: "Query",
  args,
  type,
  deprecation: null,
});

const directive = (
  name: string,
  args: readonly InputValueNode[],
  locations: readonly string[],
  isRepeatable = false,
): DirectiveDefinitionNode => ({
  kind: "directive",
  name,
  path: `directives/${name}.md`,
  description: null,
  appliedDirectives: [],
  locations,
  args,
  isRepeatable,
});

describe("operationSignature", () => {
  it("renders arguments, defaults and the return type", () => {
    const node = operation(
      "products",
      [arg("filter", ref("ProductFilter")), arg("first", ref("Int"), "20")],
      ref("Product", ["nonNull", "list", "nonNull"]),
    );

    expect(operationSignature(node)).toBe(
      "products(filter: ProductFilter, first: Int = 20): [Product!]!",
    );
  });

  it("omits empty parentheses when there are no arguments", () => {
    expect(operationSignature(operation("me", [], ref("Customer")))).toBe("me: Customer");
  });

  it("keeps arguments in declaration order rather than sorting them", () => {
    const node = operation(
      "search",
      [arg("term", ref("String", ["nonNull"])), arg("after", ref("String"))],
      ref("Result"),
    );

    expect(operationSignature(node)).toBe("search(term: String!, after: String): Result");
  });

  it("renders a built-in scalar as a bare name, since it has no concept file", () => {
    const node = operation("count", [], { name: "Int", path: null, wrappers: ["nonNull"] });

    expect(operationSignature(node)).toBe("count: Int!");
  });
});

describe("directiveSignature", () => {
  it("renders the name, arguments and locations", () => {
    const node = directive(
      "auth",
      [arg("requires", ref("Role", ["nonNull"]), "CUSTOMER")],
      ["FIELD_DEFINITION", "OBJECT"],
    );

    expect(directiveSignature(node)).toBe(
      "@auth(requires: Role! = CUSTOMER) on FIELD_DEFINITION | OBJECT",
    );
  });

  it("renders a directive with no arguments", () => {
    expect(directiveSignature(directive("tag", [], ["FIELD_DEFINITION"]))).toBe(
      "@tag on FIELD_DEFINITION",
    );
  });

  it("puts `repeatable` in its SDL slot, before `on`", () => {
    const node = directive("tag", [arg("name", ref("String", ["nonNull"]))], ["OBJECT"], true);

    expect(directiveSignature(node)).toBe("@tag(name: String!) repeatable on OBJECT");
  });
});
