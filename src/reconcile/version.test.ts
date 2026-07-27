import { describe, expect, it } from "vitest";
import { GraphqlOkfError } from "../errors.js";
import { assertNoDowngrade, v2Evidence } from "./version.js";

const v1Concept = [
  "---",
  'type: "GraphQL Object Type"',
  'title: "Country"',
  'timestamp: "2026-01-01T00:00:00.000Z"',
  "---",
  "",
  "<!-- graphql-okf:generated:start -->",
  "# Country",
  "<!-- graphql-okf:generated:end -->",
  "",
].join("\n");

const v2Concept = [
  "---",
  'type: "GraphQL Object Type"',
  'title: "Country"',
  'generated: { by: "graphql-okf/0.1", at: "2026-01-01T00:00:00.000Z" }',
  "---",
  "",
  "<!-- graphql-okf:generated:start -->",
  "# Country",
  "<!-- graphql-okf:generated:end -->",
  "",
].join("\n");

const rootIndex = (version: string) =>
  `---\nokf_version: "${version}"\nresource: "https://api.test/graphql"\n---\n\n# API interface\n`;

describe("v2Evidence", () => {
  it("finds nothing in an empty bundle", () => {
    expect(v2Evidence(new Map())).toBeNull();
  });

  it("finds nothing in a v0.1 bundle", () => {
    expect(
      v2Evidence(
        new Map([
          ["index.md", rootIndex("0.1")],
          ["types/objects/Country.md", v1Concept],
        ]),
      ),
    ).toBeNull();
  });

  it("reports the root index declaration", () => {
    expect(v2Evidence(new Map([["index.md", rootIndex("0.2")]]))).toContain("index.md");
  });

  it("ignores a hand-written stray file that happens to have a 'generated' key", () => {
    const stray = ["---", 'generated: "by hand"', "---", ""].join("\n");
    expect(
      v2Evidence(
        new Map([
          ["index.md", rootIndex("0.1")],
          ["types/objects/Country.md", v1Concept],
          ["NOTE.md", stray],
        ]),
      ),
    ).toBeNull();
  });

  it("reports a converted concept even when the index still says 0.1", () => {
    const evidence = v2Evidence(
      new Map([
        ["index.md", rootIndex("0.1")],
        ["types/objects/Country.md", v2Concept],
      ]),
    );

    expect(evidence).toContain("types/objects/Country.md");
  });
});

describe("assertNoDowngrade", () => {
  it("allows a v0.2 run against a v0.2 bundle", () => {
    expect(() =>
      assertNoDowngrade(new Map([["index.md", rootIndex("0.2")]]), "0.2", "okf/api"),
    ).not.toThrow();
  });

  it("allows a v0.1 run against a v0.1 bundle", () => {
    expect(() =>
      assertNoDowngrade(new Map([["index.md", rootIndex("0.1")]]), "0.1", "okf/api"),
    ).not.toThrow();
  });

  it("refuses a v0.1 run against a v0.2 bundle", () => {
    expect(() =>
      assertNoDowngrade(new Map([["index.md", rootIndex("0.2")]]), "0.1", "okf/api"),
    ).toThrow(GraphqlOkfError);
  });

  it("allows a v0.1 run against a genuinely v0.1 bundle with a stray 'generated' file", () => {
    const stray = ["---", 'generated: "by hand"', "---", ""].join("\n");
    expect(() =>
      assertNoDowngrade(
        new Map([
          ["index.md", rootIndex("0.1")],
          ["NOTE.md", stray],
        ]),
        "0.1",
        "okf/api",
      ),
    ).not.toThrow();
  });

  it("names the directory, both versions and what would be lost", () => {
    try {
      assertNoDowngrade(new Map([["index.md", rootIndex("0.2")]]), "0.1", "okf/api");
      expect.unreachable("expected a downgrade error");
    } catch (error) {
      expect((error as GraphqlOkfError).code).toBe("OKF_VERSION_DOWNGRADE");
      expect((error as Error).message).toContain("okf/api");
      expect((error as Error).message).toContain("0.2");
      expect((error as Error).message).toContain("stale_after");
    }
  });
});
