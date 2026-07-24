// src/emit/render/concept.test.ts
import { describe, expect, it } from "vitest";
import type { ScalarTypeNode } from "../../model/ir.js";
import { renderConcept } from "./concept.js";
import { GENERATED_END, GENERATED_START } from "./seam.js";

const scalar: ScalarTypeNode = {
  kind: "scalar",
  name: "String",
  path: "types/scalars/String.md",
  description: null,
  appliedDirectives: [],
  specifiedByUrl: null,
  isBuiltIn: true,
};

describe("renderConcept", () => {
  it("wraps frontmatter and body with the generated markers and a human area", () => {
    const out = renderConcept(scalar, "test.graphql", "2026-07-23T12:00:00.000Z");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain(GENERATED_START);
    expect(out).toContain("# String");
    expect(out).toContain(GENERATED_END);
    expect(out.indexOf(GENERATED_START)).toBeLessThan(out.indexOf("# String"));
    expect(out.indexOf("# String")).toBeLessThan(out.indexOf(GENERATED_END));
    expect(out).toContain("Human-authored content below this line is preserved");
    expect(out.endsWith("\n")).toBe(true);
  });
});
