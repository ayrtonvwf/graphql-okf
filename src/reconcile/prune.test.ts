import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, GENERATED_HINT, HUMAN_HINT } from "../emit/render/seam.js";
import { pruneBundle } from "./prune.js";

/** A spec-defined concept file as a pre-#23 release wrote it. */
function builtInFile(title: string, human = EMPTY_HUMAN): string {
  return assembleFile(
    {
      preamble: `---\ntype: "GraphQL Scalar Type"\ntitle: ${JSON.stringify(title)}\n---\n\n`,
      generated: `\n${GENERATED_HINT}\n\n# ${title}\n\nBuilt-in GraphQL scalar.\n\n`,
    },
    human,
  );
}

describe("pruneBundle", () => {
  it("deletes every spec-defined concept file the bundle holds", () => {
    const existing = new Map([
      ["types/ID.md", builtInFile("ID")],
      ["types/String.md", builtInFile("String")],
      ["directives/skip.md", builtInFile("skip")],
      ["types/Product.md", builtInFile("Product")],
    ]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual(["directives/skip.md", "types/ID.md", "types/String.md"]);
    expect(result.files.has("types/ID.md")).toBe(false);
    expect(result.files.has("types/Product.md")).toBe(true);
  });

  it("leaves the input map untouched", () => {
    const existing = new Map([["types/ID.md", builtInFile("ID")]]);

    pruneBundle(existing);

    expect(existing.has("types/ID.md")).toBe(true);
  });

  it("keeps a file carrying human-authored text", () => {
    const existing = new Map([
      ["types/ID.md", builtInFile("ID", `\n\n${HUMAN_HINT}\n\nWe mint these as UUIDv7.\n`)],
    ]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect(result.files.has("types/ID.md")).toBe(true);
  });

  it("never touches a file graphql-okf does not own", () => {
    const existing = new Map([["types/ID.md", "# ID\n\nSomeone's own notes.\n"]]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect(result.files.has("types/ID.md")).toBe(true);
  });

  it("prunes a built-in an intermediate release already tombstoned", () => {
    const tombstoned = assembleFile(
      {
        preamble: `---\ntitle: "ID"\ngraphql_okf_status: "removed"\n---\n\n`,
        generated: "\n> **Removed.**\n\n# Last known definition\n\n# ID\n\n",
      },
      EMPTY_HUMAN,
    );

    const result = pruneBundle(new Map([["types/ID.md", tombstoned]]));

    expect([...result.pruned]).toEqual(["types/ID.md"]);
  });

  it("is a no-op on a bundle that has already been pruned", () => {
    const existing = new Map([["types/Product.md", builtInFile("Product")]]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect([...result.files]).toEqual([...existing]);
  });
});
