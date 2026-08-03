import { describe, expect, it } from "vitest";
import type { DirectiveDefinitionNode, ObjectTypeNode, OperationNode } from "../../model/ir.js";
import { conceptResource } from "./resource.js";

const ORIGIN = "https://api.test/graphql";

const country: ObjectTypeNode = {
  kind: "object",
  name: "Country",
  path: "types/Country.md",
  description: null,
  appliedDirectives: [],
  fields: [],
  interfaces: [],
};

const countries: OperationNode = {
  kind: "query",
  name: "countries",
  rootTypeName: "Query",
  path: "queries/countries.md",
  description: null,
  appliedDirectives: [],
  args: [],
  type: { wrappers: [], name: "Country", path: "types/Country.md" },
  deprecation: null,
};

const deprecated: DirectiveDefinitionNode = {
  kind: "directive",
  name: "deprecated",
  path: "directives/deprecated.md",
  description: null,
  appliedDirectives: [],
  locations: [],
  args: [],
  isRepeatable: false,
};

describe("conceptResource", () => {
  it("anchors a named type on its name", () => {
    expect(conceptResource(ORIGIN, country)).toBe("https://api.test/graphql#Country");
  });

  it("anchors a root operation on its declared root type", () => {
    expect(conceptResource(ORIGIN, countries)).toBe("https://api.test/graphql#Query.countries");
  });

  it("uses a renamed root type in the anchor", () => {
    expect(conceptResource(ORIGIN, { ...countries, rootTypeName: "RootQuery" })).toBe(
      "https://api.test/graphql#RootQuery.countries",
    );
  });

  it("anchors a directive with its at-sign", () => {
    expect(conceptResource(ORIGIN, deprecated)).toBe("https://api.test/graphql#@deprecated");
  });

  it("replaces a fragment the origin already carries", () => {
    expect(conceptResource("https://api.test/graphql#ignored", country)).toBe(
      "https://api.test/graphql#Country",
    );
  });

  it("works for a file: origin", () => {
    expect(conceptResource("file:///tmp/schema.graphql", country)).toBe(
      "file:///tmp/schema.graphql#Country",
    );
  });
});
