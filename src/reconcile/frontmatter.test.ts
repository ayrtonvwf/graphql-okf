import { describe, expect, it } from "vitest";
import {
  frontmatterValue,
  mergeFrontmatter,
  parseFrontmatterEntries,
  replaceEntry,
  withoutProvenance,
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

describe("withoutProvenance", () => {
  it("drops the timestamp entry and leaves the rest byte-identical", () => {
    const stripped = withoutProvenance(rendered);

    expect(stripped).not.toContain("timestamp:");
    expect(stripped).toContain('title: "Country"');
  });

  it("returns the preamble unchanged when there is no frontmatter block", () => {
    expect(withoutProvenance("# Types\n\n")).toBe("# Types\n\n");
  });

  it("drops the v0.1 timestamp", () => {
    expect(withoutProvenance(rendered)).not.toContain("timestamp:");
  });

  it("drops the v0.2 generated mapping", () => {
    const v2 = [
      "---",
      'type: "object"',
      'title: "Country"',
      'generated: { by: "graphql-okf/0.1", at: "2026-07-24T09:00:00.000Z" }',
      "---",
      "",
    ].join("\n");

    expect(withoutProvenance(v2)).not.toContain("generated:");
    expect(withoutProvenance(v2)).toContain('title: "Country"');
  });

  it("makes two runs of different producer versions compare equal", () => {
    const older =
      '---\ntype: "object"\ngenerated: { by: "graphql-okf/0.1", at: "2026-01-01T00:00:00.000Z" }\n---\n';
    const newer =
      '---\ntype: "object"\ngenerated: { by: "graphql-okf/9.9", at: "2026-07-27T09:00:00.000Z" }\n---\n';

    expect(withoutProvenance(older)).toBe(withoutProvenance(newer));
  });

  it("leaves a block it cannot parse alone", () => {
    expect(withoutProvenance("# Types\n\n")).toBe("# Types\n\n");
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

describe("replaceEntry", () => {
  it("swaps one pair and leaves every other byte alone", () => {
    const before = [
      "---",
      'type: "object"',
      "# a human's note",
      'owner: "platform-team"',
      'timestamp: "2026-01-01T00:00:00.000Z"',
      'title: "Country"',
      "---",
      "",
      "body text\n",
    ].join("\n");

    const after = replaceEntry(
      before,
      "timestamp",
      'generated: { by: "graphql-okf/0.1", at: "2026-01-01T00:00:00.000Z" }',
    );

    expect(after).toContain('generated: { by: "graphql-okf/0.1", at: "2026-01-01T00:00:00.000Z" }');
    expect(after).not.toContain("timestamp:");
    expect(after).toContain("# a human's note");
    expect(after).toContain('owner: "platform-team"');
    expect(after).toContain("body text");
    expect(after?.indexOf('type: "object"')).toBeLessThan(after?.indexOf("generated:") ?? -1);
    expect(after?.indexOf("generated:")).toBeLessThan(after?.indexOf('title: "Country"') ?? -1);
  });

  it("returns null when the key is not there", () => {
    expect(replaceEntry('---\ntype: "object"\n---\n', "timestamp", "x: 1")).toBeNull();
  });

  it("returns null when the block will not parse", () => {
    expect(replaceEntry("no frontmatter here\n", "timestamp", "x: 1")).toBeNull();
  });
});
