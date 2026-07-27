import { describe, expect, it } from "vitest";
import {
  frontmatterValue,
  mergeFrontmatter,
  parseFrontmatterEntries,
  withoutTimestamp,
} from "./frontmatter.js";

const rendered = [
  "---",
  'type: "object"',
  'title: "Country"',
  'resource: "https://api.test/graphql#Country"',
  'tags: ["graphql", "object"]',
  'timestamp: "2026-07-24T09:00:00.000Z"',
  "---",
  "",
].join("\n");

function existingWith(...humanLines: string[]): string {
  return [
    "---",
    'type: "object"',
    'title: "Country"',
    'resource: "https://api.test/graphql#Country"',
    'tags: ["graphql", "object"]',
    'timestamp: "2026-01-01T00:00:00.000Z"',
    ...humanLines,
    "---",
    "",
  ].join("\n");
}

describe("parseFrontmatterEntries", () => {
  it("returns one entry per top-level pair", () => {
    const entries = parseFrontmatterEntries(rendered);

    expect(entries?.map((entry) => entry.key)).toEqual([
      "type",
      "title",
      "resource",
      "tags",
      "timestamp",
    ]);
  });

  it("returns null for a preamble with no frontmatter block", () => {
    expect(parseFrontmatterEntries("# Object types\n\n")).toBeNull();
  });

  it("reassembles to the exact original bytes", () => {
    const entries = parseFrontmatterEntries(rendered);

    expect(entries?.map((entry) => entry.text).join("")).toBe(
      [
        'type: "object"',
        'title: "Country"',
        'resource: "https://api.test/graphql#Country"',
        'tags: ["graphql", "object"]',
        'timestamp: "2026-07-24T09:00:00.000Z"',
        "",
      ].join("\n"),
    );
  });
});

describe("mergeFrontmatter", () => {
  it("preserves a plain human key", () => {
    expect(mergeFrontmatter(rendered, existingWith("owner: platform-team"))).toContain(
      "owner: platform-team",
    );
  });

  // Each of these is a confirmed loss case under the old line-regex parser.
  it.each([
    ["a dotted key", "gql.kind: object"],
    ["a key containing a space", "my key: value"],
    ["a quoted key", '"quoted key": value'],
    ["a comment line", "# owner: platform"],
  ])("preserves %s", (_label, line) => {
    expect(mergeFrontmatter(rendered, existingWith(line))).toContain(line);
  });

  it("preserves a non-matching line that appears first in the block", () => {
    const existing = [
      "---",
      "# lifecycle: reviewed",
      'type: "object"',
      'title: "Country"',
      'timestamp: "2026-01-01T00:00:00.000Z"',
      "---",
      "",
    ].join("\n");

    expect(mergeFrontmatter(rendered, existing)).toContain("# lifecycle: reviewed");
  });

  it("preserves a multi-line block scalar", () => {
    const merged = mergeFrontmatter(
      rendered,
      existingWith("notes: |", "  first line", "  second line"),
    );

    expect(merged).toContain("notes: |\n  first line\n  second line");
  });

  it("drops machine keys from the existing side so they are not duplicated", () => {
    const merged = mergeFrontmatter(rendered, existingWith("owner: platform-team"));

    expect(merged).toContain('timestamp: "2026-07-24T09:00:00.000Z"');
    expect(merged).not.toContain('timestamp: "2026-01-01T00:00:00.000Z"');
  });

  it("returns the rendered side unchanged when the existing block has no human keys", () => {
    expect(mergeFrontmatter(rendered, existingWith())).toBe(rendered);
  });

  it("preserves an unparseable existing block verbatim rather than rewriting it", () => {
    const broken = ["---", "type: [unclosed", "owner: platform-team", "---", ""].join("\n");

    expect(mergeFrontmatter(rendered, broken)).toBe(broken);
  });
});

describe("withoutTimestamp", () => {
  it("drops the timestamp entry and leaves the rest byte-identical", () => {
    const stripped = withoutTimestamp(rendered);

    expect(stripped).not.toContain("timestamp:");
    expect(stripped).toContain('title: "Country"');
  });

  it("returns the preamble unchanged when there is no frontmatter block", () => {
    expect(withoutTimestamp("# Types\n\n")).toBe("# Types\n\n");
  });
});

describe("frontmatterValue", () => {
  it("returns the raw source text of the value", () => {
    expect(frontmatterValue(rendered, "title")).toBe('"Country"');
  });

  it("returns null for an absent key", () => {
    expect(frontmatterValue(rendered, "status")).toBeNull();
  });
});
