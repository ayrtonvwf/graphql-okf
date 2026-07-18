import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { LoadedSchema } from "../source/types.js";
import type {
  ConceptNode,
  EnumTypeNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  ScalarTypeNode,
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
        type User { tags: [[String!]]! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields[0]?.type).toEqual({
      wrappers: ["nonNull", "list", "list", "nonNull"],
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
        interface Entity implements Node { id: ID! }
        type User implements Node & Entity { id: ID! }
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
