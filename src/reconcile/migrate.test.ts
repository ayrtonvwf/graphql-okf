import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { emitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, LEGACY_HUMAN_HINT } from "../emit/render/seam.js";
import { migrateBundle } from "./migrate.js";

const T = "2026-07-27T09:00:00.000Z";
const ORIGINAL = "2026-01-15T09:00:00.000Z";

function concept(...frontmatterLines: string[]): string {
  return [
    "---",
    'type: "GraphQL Object Type"',
    'title: "Country"',
    ...frontmatterLines,
    "---",
    "",
    "<!-- graphql-okf:generated:start -->",
    "",
    "# Country",
    "",
    "<!-- graphql-okf:generated:end -->",
    "",
    "our own notes",
    "",
  ].join("\n");
}

const v1 = concept(`timestamp: "${ORIGINAL}"`);

function frontmatterOf(text: string): Record<string, unknown> {
  const closing = text.indexOf("\n---\n", 3);
  return parse(text.slice(4, closing + 1)) as Record<string, unknown>;
}

describe("migrateBundle", () => {
  it("does nothing at all when the run targets v0.1", () => {
    const result = migrateBundle(new Map([["types/Country.md", v1]]), emitContext("0.1", T));

    expect(result.migrated).toEqual([]);
    expect(result.files.get("types/Country.md")).toBe(v1);
  });

  it("rewrites timestamp as a generated mapping", () => {
    const result = migrateBundle(new Map([["types/Country.md", v1]]), emitContext("0.2", T));

    expect(result.migrated).toEqual(["types/Country.md"]);
    const front = frontmatterOf(result.files.get("types/Country.md") ?? "");
    expect(front.generated).toEqual({ by: "graphql-okf/0.1", at: ORIGINAL });
    expect(front.timestamp).toBeUndefined();
  });

  it("preserves the original timestamp rather than restamping with the run's time", () => {
    const result = migrateBundle(new Map([["types/Country.md", v1]]), emitContext("0.2", T));
    const front = frontmatterOf(result.files.get("types/Country.md") ?? "");

    expect((front.generated as { at: string }).at).toBe(ORIGINAL);
    expect((front.generated as { at: string }).at).not.toBe(T);
  });

  it("keeps generated.at a string under YAML 1.1 even when the source was unquoted", () => {
    const unquoted = concept(`timestamp: ${ORIGINAL}`);
    const result = migrateBundle(new Map([["types/Country.md", unquoted]]), emitContext("0.2", T));
    const text = result.files.get("types/Country.md") ?? "";
    const closing = text.indexOf("\n---\n", 3);
    const front = parse(text.slice(4, closing + 1), { version: "1.1" }) as {
      generated: { at: unknown };
    };

    expect(typeof front.generated.at).toBe("string");
  });

  it("preserves human frontmatter keys and human prose", () => {
    const withHuman = concept(`timestamp: "${ORIGINAL}"`, 'owner: "platform-team"');
    const result = migrateBundle(new Map([["types/Country.md", withHuman]]), emitContext("0.2", T));
    const text = result.files.get("types/Country.md") ?? "";

    expect(text).toContain('owner: "platform-team"');
    expect(text).toContain("our own notes");
  });

  it("migrates a tombstone, which is never re-rendered and would otherwise never convert", () => {
    const tombstone = concept(
      `timestamp: "${ORIGINAL}"`,
      'graphql_okf_status: "removed"',
      `removedAt: "${ORIGINAL}"`,
    );
    const result = migrateBundle(new Map([["types/Gone.md", tombstone]]), emitContext("0.2", T));
    const front = frontmatterOf(result.files.get("types/Gone.md") ?? "");

    expect(front.generated).toEqual({ by: "graphql-okf/0.1", at: ORIGINAL });
    expect(front.graphql_okf_status).toBe("removed");
  });

  it("leaves an already-migrated concept untouched, so a second run is a no-op", () => {
    const once = migrateBundle(new Map([["types/Country.md", v1]]), emitContext("0.2", T));
    const twice = migrateBundle(once.files, emitContext("0.2", "2026-08-01T00:00:00.000Z"));

    expect(twice.migrated).toEqual([]);
    expect(twice.files.get("types/Country.md")).toBe(once.files.get("types/Country.md"));
  });

  it("converges after an interruption, migrating only what is left", () => {
    const half = new Map([
      ["types/Country.md", concept(`generated: { by: "graphql-okf/0.1", at: "${ORIGINAL}" }`)],
      ["types/City.md", v1],
    ]);

    expect(migrateBundle(half, emitContext("0.2", T)).migrated).toEqual(["types/City.md"]);
  });

  it("ignores log.md and files with no provenance at all", () => {
    const result = migrateBundle(
      new Map([
        ["log.md", "---\ntype: Log\n---\n\n# Update Log\n"],
        ["types/index.md", "# Types\n\n* [Country](Country.md)\n"],
      ]),
      emitContext("0.2", T),
    );

    expect(result.migrated).toEqual([]);
  });

  it("never rewrites a stray, marker-less file even if it has a timestamp key (GOAL-8.3)", () => {
    const stray = ["---", `timestamp: "${ORIGINAL}"`, "---", "", "Hand-written notes.", ""].join(
      "\n",
    );
    const result = migrateBundle(new Map([["NOTES.md", stray]]), emitContext("0.2", T));

    expect(result.migrated).toEqual([]);
    expect(result.files.get("NOTES.md")).toBe(stray);
  });

  it("converts a legacy 'status: removed' tombstone key to graphql_okf_status", () => {
    const legacyTombstone = concept(
      `timestamp: "${ORIGINAL}"`,
      'status: "removed"',
      `removedAt: "${ORIGINAL}"`,
    );
    const result = migrateBundle(
      new Map([["types/Gone.md", legacyTombstone]]),
      emitContext("0.2", T),
    );

    expect(result.migrated).toEqual(["types/Gone.md"]);
    const text = result.files.get("types/Gone.md") ?? "";
    const front = frontmatterOf(text);

    expect(front.graphql_okf_status).toBe("removed");
    expect(front.status).toBeUndefined();
    expect(text).not.toMatch(/^status: "removed"$/m);
    expect(front.generated).toEqual({ by: "graphql-okf/0.1", at: ORIGINAL });
  });

  it("leaves a non-removed 'status' value untouched (real spec vocabulary)", () => {
    const draft = concept(`timestamp: "${ORIGINAL}"`, 'status: "deprecated"');
    const result = migrateBundle(new Map([["types/Country.md", draft]]), emitContext("0.2", T));

    const front = frontmatterOf(result.files.get("types/Country.md") ?? "");
    expect(front.status).toBe("deprecated");
    expect(front.graphql_okf_status).toBeUndefined();
  });

  it("returns migrated paths in a deterministic order", () => {
    const result = migrateBundle(
      new Map([
        ["types/Zebra.md", v1],
        ["types/Ant.md", v1],
      ]),
      emitContext("0.2", T),
    );

    expect(result.migrated).toEqual(["types/Ant.md", "types/Zebra.md"]);
  });

  const LEGACY_EMPTY = `\n\n${LEGACY_HUMAN_HINT}\n`;

  function legacyFile(human: string): string {
    return assembleFile(
      {
        preamble: '---\ntype: "GraphQL Object Type"\ntitle: "Order"\n---\n\n',
        generated: "\n# Order\n\n",
      },
      human,
    );
  }

  it("strips the human hint from a pristine human region (issue #24)", () => {
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(EMPTY_HUMAN));
    expect(result.migrated).toEqual(["types/Order.md"]);
  });

  it("reports a hint-only strip as hintStripped, not frontmatterMigrated (#24)", () => {
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.hintStripped).toEqual(["types/Order.md"]);
    expect(result.frontmatterMigrated).toEqual([]);
  });

  it("reports a provenance-only conversion as frontmatterMigrated, not hintStripped", () => {
    const result = migrateBundle(new Map([["types/Country.md", v1]]), emitContext("0.2", T));

    expect(result.frontmatterMigrated).toEqual(["types/Country.md"]);
    expect(result.hintStripped).toEqual([]);
  });

  it("reports a file hit by both conversions in both lists", () => {
    const both = assembleFile(
      {
        preamble:
          '---\ntype: "GraphQL Object Type"\ntitle: "Order"\ntimestamp: "2026-01-15T09:00:00.000Z"\n---\n\n',
        generated: "\n# Order\n\n",
      },
      LEGACY_EMPTY,
    );
    const result = migrateBundle(new Map([["types/Order.md", both]]), emitContext("0.2", T));

    expect(result.migrated).toEqual(["types/Order.md"]);
    expect(result.frontmatterMigrated).toEqual(["types/Order.md"]);
    expect(result.hintStripped).toEqual(["types/Order.md"]);
  });

  it("leaves a human region a human has written in completely alone", () => {
    const written = `\n\n${LEGACY_HUMAN_HINT}\n\nOwned by the Catalog team.\n`;
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(written)]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(written));
    expect(result.migrated).toEqual([]);
  });

  it("strips the hint under okf-version 0.1 too", () => {
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]),
      emitContext("0.1", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(EMPTY_HUMAN));
  });

  it("is idempotent", () => {
    const ctx = emitContext("0.2", "2026-08-04T00:00:00.000Z");
    const once = migrateBundle(new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]), ctx);
    const twice = migrateBundle(once.files, ctx);

    expect(twice.migrated).toEqual([]);
    expect(twice.files.get("types/Order.md")).toBe(once.files.get("types/Order.md"));
  });

  it("does not touch a file graphql-okf does not own", () => {
    const stray = `# Notes\n\n${LEGACY_HUMAN_HINT}\n`;
    const result = migrateBundle(
      new Map([["types/notes.md", stray]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/notes.md")).toBe(stray);
    expect(result.migrated).toEqual([]);
  });
});
