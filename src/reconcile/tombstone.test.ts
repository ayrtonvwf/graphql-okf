import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { emitContext } from "../emit/context.js";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { splitFile } from "./parse.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";

function split(text: string) {
  const result = splitFile(text, "types/LegacyOrder.md");
  if (result === null) throw new Error("expected an owned file");
  return result;
}

const existingConcept = [
  "---",
  'type: "object"',
  'title: "Country"',
  'timestamp: "2026-01-01T00:00:00.000Z"',
  "---",
  "",
  "<!-- graphql-okf:generated:start -->",
  "",
  "# Country",
  "",
  "<!-- graphql-okf:generated:end -->",
  "",
].join("\n");

const live = split(
  `---\ntype: object\ntitle: "LegacyOrder"\nresource: "x"\ntags: [graphql, object]\ntimestamp: 2026-07-01T10:00:00.000Z\n---\n\n<!-- graphql-okf:generated:start -->\n${GENERATED_HINT}\n\n# LegacyOrder\n\n## Fields\n\n- **\`id\`**: \`ID!\`\n\n<!-- graphql-okf:generated:end -->\n\nour notes\n`,
);

describe("titleOf", () => {
  it("reads the JSON-encoded title", () => {
    expect(titleOf(live, "types/LegacyOrder.md")).toBe("LegacyOrder");
  });

  it("falls back to the file basename when there is no title", () => {
    const untitled = split(
      "---\ntype: object\n---\n\n<!-- graphql-okf:generated:start -->\nx\n<!-- graphql-okf:generated:end -->\n",
    );
    expect(titleOf(untitled, "types/Ghost.md")).toBe("Ghost");
  });
});

describe("isTombstoned", () => {
  it("is false for a live concept", () => {
    expect(isTombstoned(live)).toBe(false);
  });

  it("is true once the file has been tombstoned", () => {
    const tombstoned = {
      parts: renderTombstone(live, emitContext("0.1", "2026-07-24T09:00:00.000Z")),
      human: live.human,
    };
    expect(isTombstoned(tombstoned)).toBe(true);
  });
});

describe("renderTombstone", () => {
  const parts = renderTombstone(live, emitContext("0.1", "2026-07-24T09:00:00.000Z"));

  it("adds status and removedAt without disturbing the original timestamp", () => {
    expect(parts.preamble).toContain('graphql_okf_status: "removed"');
    expect(parts.preamble).toContain('removedAt: "2026-07-24T09:00:00.000Z"');
    expect(parts.preamble).toContain("timestamp: 2026-07-01T10:00:00.000Z");
  });

  it("quotes removedAt so YAML 1.1 consumers see a string", () => {
    const split = splitFile(existingConcept, "types/Country.md");
    if (split === null) throw new Error("fixture must be an owned file");

    const parts = renderTombstone(split, emitContext("0.1", "2026-08-01T00:00:00.000Z"));

    const [, body] = /^---\n([\s\S]*?)\n---\n/.exec(parts.preamble) ?? [];
    if (body === undefined) throw new Error("preamble must be fenced");
    const parsed = parse(body, { version: "1.1" });

    expect(typeof (parsed as { removedAt: unknown }).removedAt).toBe("string");
  });

  it("states the removal and retains the last known definition", () => {
    expect(parts.generated).toContain("> **Removed.** This element is no longer present");
    expect(parts.generated).toContain("as of 2026-07-24");
    expect(parts.generated).toContain("# Last known definition");
    expect(parts.generated).toContain("- **`id`**: `ID!`");
  });

  it("drops the regenerate-me hint, which no longer applies", () => {
    expect(parts.generated).not.toContain(GENERATED_HINT);
  });

  it("does not nest the preserved H1 under a lower-level heading", () => {
    const split = splitFile(existingConcept, "types/Country.md");
    if (split === null) throw new Error("fixture must be an owned file");

    const parts = renderTombstone(split, emitContext("0.1", "2026-08-01T00:00:00.000Z"));

    expect(parts.generated).toContain("# Last known definition");
    expect(parts.generated).not.toContain("## Last known definition");
    // The preserved body keeps its own H1, untouched.
    expect(parts.generated).toContain("# Country");
  });
});

describe("isTombstoned", () => {
  it("recognises a bundle written before the key was namespaced", () => {
    const legacy = split(
      '---\ntype: object\ntitle: "Gone"\nstatus: "removed"\nremovedAt: "2026-01-01T00:00:00.000Z"\n---\n\n<!-- graphql-okf:generated:start -->\nx\n<!-- graphql-okf:generated:end -->\n',
    );

    expect(isTombstoned(legacy)).toBe(true);
  });

  it("is not fooled by a spec status value that is not ours", () => {
    const deprecated = split(
      '---\ntype: object\ntitle: "Old"\nstatus: "deprecated"\n---\n\n<!-- graphql-okf:generated:start -->\nx\n<!-- graphql-okf:generated:end -->\n',
    );

    expect(isTombstoned(deprecated)).toBe(false);
  });
});

describe("renderTombstone", () => {
  it("marks removal with our own key, leaving the spec status vocabulary alone", () => {
    const parts = renderTombstone(live, emitContext("0.2", "2026-07-24T09:00:00.000Z"));

    expect(parts.preamble).toContain('graphql_okf_status: "removed"');
    expect(parts.preamble).toContain('removedAt: "2026-07-24T09:00:00.000Z"');
    expect(parts.preamble).not.toMatch(/^status:/m);
  });
});
