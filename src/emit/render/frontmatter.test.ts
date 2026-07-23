import { describe, expect, it } from "vitest";
import type { EnumTypeNode, ObjectTypeNode } from "../../model/ir.js";
import { renderFrontmatter } from "./frontmatter.js";

const objectConcept: ObjectTypeNode = {
  kind: "object",
  name: "Country",
  path: "types/objects/Country.md",
  description: "An ISO country.",
  appliedDirectives: [],
  fields: [],
  interfaces: [],
};

describe("renderFrontmatter", () => {
  it("emits all fields in order with the kind as type", () => {
    expect(
      renderFrontmatter(objectConcept, "https://api.test/graphql", "2026-07-23T12:00:00.000Z"),
    ).toBe(
      [
        "---",
        "type: object",
        'title: "Country"',
        'description: "An ISO country."',
        'resource: "https://api.test/graphql"',
        "tags: [graphql, object]",
        "timestamp: 2026-07-23T12:00:00.000Z",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("omits description when the element has none", () => {
    const enumConcept: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [],
    };
    const out = renderFrontmatter(enumConcept, "test.graphql", "2026-07-23T12:00:00.000Z");
    expect(out).not.toContain("description:");
    expect(out).toContain("tags: [graphql, enum]");
  });
});
