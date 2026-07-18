import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { LoadedSchema } from "../source/types.js";
import type { ConceptNode, EnumTypeNode, ScalarTypeNode } from "./ir.js";
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
