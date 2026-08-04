// src/emit/render/concept.test.ts
import { describe, expect, it } from "vitest";
import type { ScalarTypeNode } from "../../model/ir.js";
import { emitContext } from "../context.js";
import { renderBody } from "./body.js";
import { renderConcept, renderConceptParts } from "./concept.js";
import { GENERATED_END, GENERATED_START } from "./seam.js";

const scalar: ScalarTypeNode = {
  kind: "scalar",
  name: "String",
  path: "types/String.md",
  description: null,
  appliedDirectives: [],
  specifiedByUrl: null,
};

const ctx = emitContext("0.1", "2026-07-23T12:00:00.000Z");

describe("renderConcept", () => {
  it("wraps frontmatter and body with the generated markers and a human area", () => {
    const out = renderConcept(scalar, "test.graphql", ctx);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain(GENERATED_START);
    expect(out).toContain("# String");
    expect(out).toContain(GENERATED_END);
    expect(out.indexOf(GENERATED_START)).toBeLessThan(out.indexOf("# String"));
    expect(out.indexOf("# String")).toBeLessThan(out.indexOf(GENERATED_END));
    expect(out.endsWith("\n")).toBe(true);
  });

  it("opens the generated region with the body, not a hint comment (issue #24)", () => {
    const parts = renderConceptParts(scalar, "https://x.example/graphql#DateTime", ctx);

    expect(parts.generated).toBe(`\n${renderBody(scalar).trimEnd()}\n\n`);
    expect(parts.generated).not.toContain("<!--");
  });
});
