import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { emitContext } from "../emit/context.js";
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
    const result = migrateBundle(
      new Map([["types/objects/Country.md", v1]]),
      emitContext("0.1", T),
    );

    expect(result.migrated).toEqual([]);
    expect(result.files.get("types/objects/Country.md")).toBe(v1);
  });

  it("rewrites timestamp as a generated mapping", () => {
    const result = migrateBundle(
      new Map([["types/objects/Country.md", v1]]),
      emitContext("0.2", T),
    );

    expect(result.migrated).toEqual(["types/objects/Country.md"]);
    const front = frontmatterOf(result.files.get("types/objects/Country.md") ?? "");
    expect(front.generated).toEqual({ by: "graphql-okf/0.1", at: ORIGINAL });
    expect(front.timestamp).toBeUndefined();
  });

  it("preserves the original timestamp rather than restamping with the run's time", () => {
    const result = migrateBundle(
      new Map([["types/objects/Country.md", v1]]),
      emitContext("0.2", T),
    );
    const front = frontmatterOf(result.files.get("types/objects/Country.md") ?? "");

    expect((front.generated as { at: string }).at).toBe(ORIGINAL);
    expect((front.generated as { at: string }).at).not.toBe(T);
  });

  it("keeps generated.at a string under YAML 1.1 even when the source was unquoted", () => {
    const unquoted = concept(`timestamp: ${ORIGINAL}`);
    const result = migrateBundle(
      new Map([["types/objects/Country.md", unquoted]]),
      emitContext("0.2", T),
    );
    const text = result.files.get("types/objects/Country.md") ?? "";
    const closing = text.indexOf("\n---\n", 3);
    const front = parse(text.slice(4, closing + 1), { version: "1.1" }) as {
      generated: { at: unknown };
    };

    expect(typeof front.generated.at).toBe("string");
  });

  it("preserves human frontmatter keys and human prose", () => {
    const withHuman = concept(`timestamp: "${ORIGINAL}"`, 'owner: "platform-team"');
    const result = migrateBundle(
      new Map([["types/objects/Country.md", withHuman]]),
      emitContext("0.2", T),
    );
    const text = result.files.get("types/objects/Country.md") ?? "";

    expect(text).toContain('owner: "platform-team"');
    expect(text).toContain("our own notes");
  });

  it("migrates a tombstone, which is never re-rendered and would otherwise never convert", () => {
    const tombstone = concept(
      `timestamp: "${ORIGINAL}"`,
      'graphql_okf_status: "removed"',
      `removedAt: "${ORIGINAL}"`,
    );
    const result = migrateBundle(
      new Map([["types/objects/Gone.md", tombstone]]),
      emitContext("0.2", T),
    );
    const front = frontmatterOf(result.files.get("types/objects/Gone.md") ?? "");

    expect(front.generated).toEqual({ by: "graphql-okf/0.1", at: ORIGINAL });
    expect(front.graphql_okf_status).toBe("removed");
  });

  it("leaves an already-migrated concept untouched, so a second run is a no-op", () => {
    const once = migrateBundle(new Map([["types/objects/Country.md", v1]]), emitContext("0.2", T));
    const twice = migrateBundle(once.files, emitContext("0.2", "2026-08-01T00:00:00.000Z"));

    expect(twice.migrated).toEqual([]);
    expect(twice.files.get("types/objects/Country.md")).toBe(
      once.files.get("types/objects/Country.md"),
    );
  });

  it("converges after an interruption, migrating only what is left", () => {
    const half = new Map([
      [
        "types/objects/Country.md",
        concept(`generated: { by: "graphql-okf/0.1", at: "${ORIGINAL}" }`),
      ],
      ["types/objects/City.md", v1],
    ]);

    expect(migrateBundle(half, emitContext("0.2", T)).migrated).toEqual(["types/objects/City.md"]);
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

  it("returns migrated paths in a deterministic order", () => {
    const result = migrateBundle(
      new Map([
        ["types/objects/Zebra.md", v1],
        ["types/objects/Ant.md", v1],
      ]),
      emitContext("0.2", T),
    );

    expect(result.migrated).toEqual(["types/objects/Ant.md", "types/objects/Zebra.md"]);
  });
});
