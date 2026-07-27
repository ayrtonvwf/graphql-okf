import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { EnumTypeNode, ObjectTypeNode } from "../../model/ir.js";
import { emitContext } from "../context.js";
import { renderFrontmatter, renderProvenance } from "./frontmatter.js";

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
  it("emits all fields in order, with every value quoted", () => {
    expect(
      renderFrontmatter(
        objectConcept,
        "https://api.test/graphql",
        emitContext("0.1", "2026-07-23T12:00:00.000Z"),
      ),
    ).toBe(
      [
        "---",
        'type: "GraphQL Object Type"',
        'title: "Country"',
        'description: "An ISO country."',
        'resource: "https://api.test/graphql"',
        'tags: ["graphql", "object"]',
        'timestamp: "2026-07-23T12:00:00.000Z"',
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
    const out = renderFrontmatter(
      enumConcept,
      "test.graphql",
      emitContext("0.1", "2026-07-23T12:00:00.000Z"),
    );
    expect(out).not.toContain("description:");
    expect(out).toContain('tags: ["graphql", "enum"]');
  });

  it("emits only the first sentence of a multi-paragraph description", () => {
    const wordy: ObjectTypeNode = {
      ...objectConcept,
      description: "A product.\n\nMay contain Markdown. Refreshed nightly.",
    };

    const out = renderFrontmatter(
      wordy,
      "https://api.test/graphql",
      emitContext("0.1", "2026-07-23T12:00:00.000Z"),
    );

    expect(out).toContain('description: "A product."');
  });

  it("keeps timestamp a string under YAML 1.1, where a bare one would be a date", () => {
    const out = renderFrontmatter(
      objectConcept,
      "https://api.test/graphql",
      emitContext("0.1", "2026-07-23T12:00:00.000Z"),
    );
    const parsed = parse(out.replace(/^---\n/, "").replace(/---\n$/, ""), { version: "1.1" });

    expect(typeof (parsed as { timestamp: unknown }).timestamp).toBe("string");
  });

  it("carries generated instead of timestamp under v0.2", () => {
    const out = renderFrontmatter(
      objectConcept,
      "https://api.test/graphql#Country",
      emitContext("0.2", "2026-07-27T09:00:00.000Z"),
    );

    expect(out).toContain('generated: { by: "graphql-okf/0.1", at: "2026-07-27T09:00:00.000Z" }');
    expect(out).not.toContain("timestamp:");
  });
});

describe("renderProvenance", () => {
  const T = "2026-07-27T09:00:00.000Z";

  it("emits v0.1's flat timestamp", () => {
    expect(renderProvenance(emitContext("0.1", T))).toBe(`timestamp: "${T}"`);
  });

  it("emits v0.2's generated mapping with the producer as the actor", () => {
    expect(renderProvenance(emitContext("0.2", T))).toBe(
      `generated: { by: "graphql-okf/0.1", at: "${T}" }`,
    );
  });

  it("quotes the datetime, so YAML 1.1 cannot read it back as a date", () => {
    expect(renderProvenance(emitContext("0.2", T))).toContain(`"${T}"`);
  });
});
