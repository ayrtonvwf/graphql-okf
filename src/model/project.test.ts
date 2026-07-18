import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { LoadedSchema } from "../source/types.js";
import type {
  ConceptNode,
  DirectiveDefinitionNode,
  EnumTypeNode,
  InputObjectTypeNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  UnionTypeNode,
} from "./ir.js";
import { project } from "./project.js";

// biome-ignore lint/suspicious/noExportsInTest: reused by later tasks' tests in this same file
export function loadedFrom(sdl: string): LoadedSchema {
  return { schema: buildSchema(sdl), resource: "test.graphql", origin: "sdl" };
}

// biome-ignore lint/suspicious/noExportsInTest: reused by later tasks' tests in this same file
export function conceptAt(concepts: readonly ConceptNode[], path: string): ConceptNode {
  const found = concepts.find((concept) => concept.path === path);
  if (found === undefined) {
    throw new Error(`no concept at ${path}; have ${concepts.map((c) => c.path).join(", ")}`);
  }
  return found;
}

describe("project", () => {
  it("carries the resource and origin through", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.resource).toBe("test.graphql");
    expect(ir.origin).toBe("sdl");
  });

  it("emits built-in scalars as concepts", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const scalar = conceptAt(ir.concepts, "types/scalars/String.md") as ScalarTypeNode;

    expect(scalar.kind).toBe("scalar");
    expect(scalar.isBuiltIn).toBe(true);
  });

  it("emits custom scalars with their specifiedBy url", () => {
    const ir = project(
      loadedFrom(`
        scalar DateTime @specifiedBy(url: "https://scalars.test/datetime")
        type Query { at: DateTime }
      `),
    );
    const scalar = conceptAt(ir.concepts, "types/scalars/DateTime.md") as ScalarTypeNode;

    expect(scalar.isBuiltIn).toBe(false);
    expect(scalar.specifiedByUrl).toBe("https://scalars.test/datetime");
    expect(scalar.appliedDirectives).toEqual([]);
  });

  it("emits enums with alphabetically sorted values and their descriptions", () => {
    const ir = project(
      loadedFrom(`
        """Access level."""
        enum Role {
          "Full access."
          OWNER
          ADMIN
          VIEWER @deprecated(reason: "use READER")
        }
        type Query { role: Role }
      `),
    );
    const role = conceptAt(ir.concepts, "types/enums/Role.md") as EnumTypeNode;

    expect(role.description).toBe("Access level.");
    expect(role.values.map((value) => value.name)).toEqual(["ADMIN", "OWNER", "VIEWER"]);
    expect(role.values[1]?.description).toBe("Full access.");
    expect(role.values[2]?.deprecation).toEqual({ reason: "use READER" });
    expect(role.values[0]?.deprecation).toBeNull();
  });

  it("excludes introspection meta types", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.concepts.some((concept) => concept.name.startsWith("__"))).toBe(false);
  });

  it("sorts concepts by path", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const paths = ir.concepts.map((concept) => concept.path);

    expect(paths).toEqual([...paths].sort());
  });
});

describe("project object and interface types", () => {
  it("records wrappers outermost-first and links to the named type", () => {
    const ir = project(
      loadedFrom(`
        type User { tags: [[String!]]!, label: [String]! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields.find((field) => field.name === "tags")?.type).toEqual({
      wrappers: ["nonNull", "list", "list", "nonNull"],
      name: "String",
      path: "types/scalars/String.md",
    });
    // [String]! is asymmetric under reversal, unlike [[String!]]! above: this
    // catches an implementation that records wrappers innermost-first instead
    // of outermost-first.
    expect(user.fields.find((field) => field.name === "label")?.type).toEqual({
      wrappers: ["nonNull", "list"],
      name: "String",
      path: "types/scalars/String.md",
    });
  });

  it("sorts fields and arguments alphabetically", () => {
    const ir = project(
      loadedFrom(`
        type User {
          name(upper: Boolean, locale: String): String
          age: Int
        }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields.map((field) => field.name)).toEqual(["age", "name"]);
    expect(user.fields[1]?.args.map((arg) => arg.name)).toEqual(["locale", "upper"]);
  });

  it("surfaces field deprecation", () => {
    const ir = project(
      loadedFrom(`
        type User { nickname: String @deprecated }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields[0]?.deprecation).toEqual({ reason: "No longer supported" });
  });

  it("links an object to the interfaces it implements", () => {
    const ir = project(
      loadedFrom(`
        interface Node { id: ID! }
        type User implements Node { id: ID! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.interfaces).toEqual([
      { wrappers: [], name: "Node", path: "types/interfaces/Node.md" },
    ]);
  });

  it("records implementedBy on an interface, including interfaces implementing interfaces", () => {
    const ir = project(
      loadedFrom(`
        interface Node { id: ID! }
        type User implements Node & Entity { id: ID! }
        interface Entity implements Node { id: ID! }
        type Query { user: User }
      `),
    );
    const node = conceptAt(ir.concepts, "types/interfaces/Node.md") as InterfaceTypeNode;

    expect(node.implementedBy.map((ref) => ref.name)).toEqual(["Entity", "User"]);
    expect(node.implementedBy.map((ref) => ref.path)).toEqual([
      "types/interfaces/Entity.md",
      "types/objects/User.md",
    ]);
  });
});

describe("project unions, inputs, and default values", () => {
  it("links a union to each of its members, sorted", () => {
    const ir = project(
      loadedFrom(`
        type Post { id: ID! }
        type Comment { id: ID! }
        union Content = Post | Comment
        type Query { content: Content }
      `),
    );
    const content = conceptAt(ir.concepts, "types/unions/Content.md") as UnionTypeNode;

    expect(content.members).toEqual([
      { wrappers: [], name: "Comment", path: "types/objects/Comment.md" },
      { wrappers: [], name: "Post", path: "types/objects/Post.md" },
    ]);
  });

  it("projects input object fields with links", () => {
    const ir = project(
      loadedFrom(`
        input OrderInput { sku: String!, quantity: Int }
        type Query { order(input: OrderInput): String }
      `),
    );
    const input = conceptAt(ir.concepts, "types/inputs/OrderInput.md") as InputObjectTypeNode;

    expect(input.fields.map((field) => field.name)).toEqual(["quantity", "sku"]);
    expect(input.fields[1]?.type).toEqual({
      wrappers: ["nonNull"],
      name: "String",
      path: "types/scalars/String.md",
    });
  });

  it("prints default values as GraphQL literals", () => {
    const ir = project(
      loadedFrom(`
        enum Role { ADMIN VIEWER }
        input Filter {
          limit: Int = 10
          label: String = "all"
          active: Boolean = true
          role: Role = VIEWER
          tags: [String!] = ["a", "b"]
          missing: String
        }
        type Query { search(filter: Filter): String }
      `),
    );
    const filter = conceptAt(ir.concepts, "types/inputs/Filter.md") as InputObjectTypeNode;
    const defaults = Object.fromEntries(
      filter.fields.map((field) => [field.name, field.defaultValue]),
    );

    expect(defaults).toEqual({
      active: "true",
      label: '"all"',
      limit: "10",
      missing: null,
      role: "VIEWER",
      tags: '["a", "b"]',
    });
  });

  it("prints default values on field arguments too", () => {
    const ir = project(
      loadedFrom(`
        type Query { search(limit: Int = 25): String }
        type Wrapper { search(limit: Int = 25): String }
      `),
    );
    const wrapper = conceptAt(ir.concepts, "types/objects/Wrapper.md") as ObjectTypeNode;

    expect(wrapper.fields[0]?.args[0]?.defaultValue).toBe("25");
  });
});

describe("project root operations", () => {
  it("emits one concept per root field under the matching directory", () => {
    const ir = project(
      loadedFrom(`
        type User { id: ID! }
        type Query { user(id: ID!): User, users: [User!]! }
        type Mutation { createUser(name: String!): User }
        type Subscription { userChanged: User }
      `),
    );

    const user = conceptAt(ir.concepts, "queries/user.md") as OperationNode;
    expect(user.kind).toBe("query");
    expect(user.args.map((arg) => arg.name)).toEqual(["id"]);
    expect(user.type).toEqual({ wrappers: [], name: "User", path: "types/objects/User.md" });

    expect(conceptAt(ir.concepts, "queries/users.md").kind).toBe("query");
    expect(conceptAt(ir.concepts, "mutations/createUser.md").kind).toBe("mutation");
    expect(conceptAt(ir.concepts, "subscriptions/userChanged.md").kind).toBe("subscription");
  });

  it("does not emit root operation types as object concepts", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.concepts.some((concept) => concept.path === "types/objects/Query.md")).toBe(false);
    // Strengthened: the brief's assertion above only rules out that one specific path.
    // Assert Query is absent as ANY object concept (by kind+name), so a bug that emitted
    // it under some other path (e.g. due to a broken pathFor) would still be caught.
    expect(
      ir.concepts.some((concept) => concept.kind === "object" && concept.name === "Query"),
    ).toBe(false);
  });

  it("honours non-default root type names", () => {
    const ir = project(
      loadedFrom(`
        schema { query: RootQuery }
        type RootQuery { hello: String }
      `),
    );

    expect(conceptAt(ir.concepts, "queries/hello.md").kind).toBe("query");
    expect(ir.concepts.some((concept) => concept.path === "types/objects/RootQuery.md")).toBe(
      false,
    );
  });

  it("links a reference to a root type at the operation directory index", () => {
    const ir = project(
      loadedFrom(`
        type Query { hello: String, self: Query }
      `),
    );
    const self = conceptAt(ir.concepts, "queries/self.md") as OperationNode;

    expect(self.type).toEqual({ wrappers: [], name: "Query", path: "queries/index.md" });
  });

  it("preserves wrappers on a wrapped reference to a root type", () => {
    // Strengthens the previous test: without this, an implementation could special-case
    // only the bare (unwrapped) named-type lookup and still pass, e.g. by checking
    // `type.name === root name` before unwrapping list/nonNull wrappers. Wrapping the
    // self-reference forces the redirect to run on the unwrapped named type while still
    // reporting the wrappers collected along the way, exactly like the non-root path.
    const ir = project(
      loadedFrom(`
        type Query { self: Query!, selves: [Query!]! }
      `),
    );
    const self = conceptAt(ir.concepts, "queries/self.md") as OperationNode;
    const selves = conceptAt(ir.concepts, "queries/selves.md") as OperationNode;

    expect(self.type).toEqual({ wrappers: ["nonNull"], name: "Query", path: "queries/index.md" });
    expect(selves.type).toEqual({
      wrappers: ["nonNull", "list", "nonNull"],
      name: "Query",
      path: "queries/index.md",
    });
  });

  it("surfaces operation deprecation", () => {
    const ir = project(loadedFrom('type Query { old: String @deprecated(reason: "gone") }'));
    const old = conceptAt(ir.concepts, "queries/old.md") as OperationNode;

    expect(old.deprecation).toEqual({ reason: "gone" });
  });
});

describe("project directives", () => {
  it("emits directive definitions with locations and args", () => {
    const ir = project(
      loadedFrom(`
        """Requires a role."""
        directive @auth(requires: String! = "USER") repeatable on FIELD_DEFINITION | OBJECT
        type Query { hello: String }
      `),
    );
    const auth = conceptAt(ir.concepts, "directives/auth.md") as DirectiveDefinitionNode;

    expect(auth.description).toBe("Requires a role.");
    expect(auth.isRepeatable).toBe(true);
    expect(auth.isBuiltIn).toBe(false);
    expect(auth.locations).toEqual(["FIELD_DEFINITION", "OBJECT"]);
    expect(auth.args[0]?.name).toBe("requires");
    expect(auth.args[0]?.defaultValue).toBe('"USER"');
  });

  it("emits built-in directives flagged as such", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const deprecated = conceptAt(
      ir.concepts,
      "directives/deprecated.md",
    ) as DirectiveDefinitionNode;

    expect(deprecated.isBuiltIn).toBe(true);
    // Strengthened: the brief's assertion above only checks isBuiltIn on one directive.
    // Also assert a custom directive definition is flagged false and that appliedDirectives
    // is always empty on directive definitions themselves (they can't carry directives),
    // so a bug that always returns true or that copies applied directives onto the
    // definition itself would still be caught.
    expect(deprecated.appliedDirectives).toEqual([]);
    const skip = conceptAt(ir.concepts, "directives/skip.md") as DirectiveDefinitionNode;
    expect(skip.isBuiltIn).toBe(true);
  });

  it("records applied custom directives with printed argument values", () => {
    const ir = project(
      loadedFrom(`
        directive @auth(requires: String!) on FIELD_DEFINITION | OBJECT
        type User @auth(requires: "ADMIN") { id: ID! @auth(requires: "SELF") }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.appliedDirectives).toEqual([
      { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: '"ADMIN"' }] },
    ]);
    expect(user.fields[0]?.appliedDirectives).toEqual([
      { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: '"SELF"' }] },
    ]);
  });

  it("excludes @deprecated and @specifiedBy from appliedDirectives", () => {
    const ir = project(
      loadedFrom(`
        scalar DateTime @specifiedBy(url: "https://scalars.test/dt")
        type User { old: String @deprecated(reason: "gone") }
        type Query { user: User }
      `),
    );
    const scalar = conceptAt(ir.concepts, "types/scalars/DateTime.md") as ScalarTypeNode;
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(scalar.appliedDirectives).toEqual([]);
    expect(scalar.specifiedByUrl).toBe("https://scalars.test/dt");
    expect(user.fields[0]?.appliedDirectives).toEqual([]);
    expect(user.fields[0]?.deprecation).toEqual({ reason: "gone" });
  });

  it("excludes @deprecated from appliedDirectives while keeping other applied directives", () => {
    // Strengthens the previous test: a buggy implementation that always returns an empty
    // appliedDirectives array (e.g. forgetting to read astNode.directives at all) would
    // still pass the test above. Applying a second, non-modeled directive alongside
    // @deprecated proves the filter removes @deprecated specifically rather than
    // suppressing everything.
    const ir = project(
      loadedFrom(`
        directive @audit on FIELD_DEFINITION
        type User { old: String @deprecated(reason: "gone") @audit }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields[0]?.appliedDirectives).toEqual([
      { name: "audit", path: "directives/audit.md", args: [] },
    ]);
  });

  it("sorts applied directives by name", () => {
    const ir = project(
      loadedFrom(`
        directive @zed on OBJECT
        directive @alpha on OBJECT
        type User @zed @alpha { id: ID! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.appliedDirectives.map((applied) => applied.name)).toEqual(["alpha", "zed"]);
    // Strengthened: the brief's assertion above only checks the resulting order, which a
    // no-op implementation would also produce by accident if applied-directive AST order
    // happened to match. Also assert the array element identities (not just names) to
    // pin down the full shape after sorting, and applying in declaration order @zed then
    // @alpha (the reverse of sorted order) makes the sort load-bearing: an implementation
    // that merely preserves AST order would fail this.
    expect(user.appliedDirectives).toEqual([
      { name: "alpha", path: "directives/alpha.md", args: [] },
      { name: "zed", path: "directives/zed.md", args: [] },
    ]);
  });
});
