import { describe, expect, it } from "vitest";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { splitFile } from "./parse.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";

function split(text: string) {
  const result = splitFile(text, "types/objects/LegacyOrder.md");
  if (result === null) throw new Error("expected an owned file");
  return result;
}

const live = split(
  `---\ntype: object\ntitle: "LegacyOrder"\nresource: "x"\ntags: [graphql, object]\ntimestamp: 2026-07-01T10:00:00.000Z\n---\n\n<!-- graphql-okf:generated:start -->\n${GENERATED_HINT}\n\n# LegacyOrder\n\n## Fields\n\n- **\`id\`**: \`ID!\`\n\n<!-- graphql-okf:generated:end -->\n\nour notes\n`,
);

describe("titleOf", () => {
  it("reads the JSON-encoded title", () => {
    expect(titleOf(live, "types/objects/LegacyOrder.md")).toBe("LegacyOrder");
  });

  it("falls back to the file basename when there is no title", () => {
    const untitled = split(
      "---\ntype: object\n---\n\n<!-- graphql-okf:generated:start -->\nx\n<!-- graphql-okf:generated:end -->\n",
    );
    expect(titleOf(untitled, "types/objects/Ghost.md")).toBe("Ghost");
  });
});

describe("isTombstoned", () => {
  it("is false for a live concept", () => {
    expect(isTombstoned(live)).toBe(false);
  });

  it("is true once the file has been tombstoned", () => {
    const tombstoned = {
      parts: renderTombstone(live, "2026-07-24T09:00:00.000Z"),
      human: live.human,
    };
    expect(isTombstoned(tombstoned)).toBe(true);
  });
});

describe("renderTombstone", () => {
  const parts = renderTombstone(live, "2026-07-24T09:00:00.000Z");

  it("adds status and removedAt without disturbing the original timestamp", () => {
    expect(parts.preamble).toContain("status: removed");
    expect(parts.preamble).toContain("removedAt: 2026-07-24T09:00:00.000Z");
    expect(parts.preamble).toContain("timestamp: 2026-07-01T10:00:00.000Z");
  });

  it("states the removal and retains the last known definition", () => {
    expect(parts.generated).toContain("> **Removed.** This element is no longer present");
    expect(parts.generated).toContain("as of 2026-07-24");
    expect(parts.generated).toContain("## Last known definition");
    expect(parts.generated).toContain("- **`id`**: `ID!`");
  });

  it("drops the regenerate-me hint, which no longer applies", () => {
    expect(parts.generated).not.toContain(GENERATED_HINT);
  });
});
