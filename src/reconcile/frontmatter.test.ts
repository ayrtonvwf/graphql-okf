import { describe, expect, it } from "vitest";
import {
  frontmatterValue,
  mergeFrontmatter,
  parseFrontmatterLines,
  withoutTimestamp,
} from "./frontmatter.js";

const rendered = `---\ntype: object\ntitle: "Country"\nresource: "x"\ntags: [graphql, object]\ntimestamp: 2026-07-24T00:00:00.000Z\n---\n\n`;

describe("parseFrontmatterLines", () => {
  it("returns one entry per key, in order", () => {
    const lines = parseFrontmatterLines(rendered);

    expect(lines?.map((line) => line.key)).toEqual([
      "type",
      "title",
      "resource",
      "tags",
      "timestamp",
    ]);
  });

  it("returns null for a preamble that is not a frontmatter block", () => {
    expect(parseFrontmatterLines("# Object types\n\n")).toBeNull();
  });
});

describe("mergeFrontmatter", () => {
  it("carries an unknown key from the existing file into the rendered frontmatter", () => {
    const existing = `---\ntype: object\ntitle: "Country"\nowner: platform-team\n---\n\n`;

    const merged = mergeFrontmatter(rendered, existing);

    expect(merged).toContain("owner: platform-team");
    expect(merged.indexOf("owner:")).toBeGreaterThan(merged.indexOf("timestamp:"));
    expect(merged.trimEnd().endsWith("---")).toBe(true);
  });

  it("does not carry over machine-owned keys such as status and removedAt", () => {
    const existing = `---\ntype: object\nstatus: removed\nremovedAt: 2026-01-01T00:00:00.000Z\n---\n\n`;

    const merged = mergeFrontmatter(rendered, existing);

    expect(merged).not.toContain("status:");
    expect(merged).not.toContain("removedAt:");
  });

  it("leaves the rendered text alone when the existing preamble has no frontmatter", () => {
    expect(mergeFrontmatter(rendered, "# Object types\n\n")).toBe(rendered);
  });
});

describe("withoutTimestamp", () => {
  it("removes only the timestamp line", () => {
    const stripped = withoutTimestamp(rendered);

    expect(stripped).not.toContain("timestamp:");
    expect(stripped).toContain('title: "Country"');
  });
});

describe("frontmatterValue", () => {
  it("reads a raw value by key", () => {
    expect(frontmatterValue(rendered, "title")).toBe('"Country"');
  });

  it("returns null for an absent key", () => {
    expect(frontmatterValue(rendered, "status")).toBeNull();
  });
});
