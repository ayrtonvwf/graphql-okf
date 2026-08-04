import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, LEGACY_HUMAN_HINT } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";
import { relayoutBundle } from "./relayout.js";

function owned(body: string, human = EMPTY_HUMAN): string {
  return assembleFile(
    { preamble: "---\ntype: GraphQL Object Type\n---\n\n# X\n\n", generated: `\n${body}\n` },
    human,
  );
}

describe("relayoutBundle", () => {
  it("moves an owned concept file out of its kind directory", () => {
    const file = owned("body");
    const result = relayoutBundle(new Map([["types/objects/Product.md", file]]));

    expect(result.files.get("types/Product.md")).toBe(file);
    expect(result.files.has("types/objects/Product.md")).toBe(false);
    expect(result.moves).toEqual([{ from: "types/objects/Product.md", to: "types/Product.md" }]);
    expect(result.deletes).toEqual(["types/objects/Product.md"]);
  });

  it("carries the human region across the move byte for byte", () => {
    const human = `\n\n${LEGACY_HUMAN_HINT}\nOwned by the Catalog team.\n`;
    const result = relayoutBundle(new Map([["types/objects/Product.md", owned("body", human)]]));

    expect(result.files.get("types/Product.md")).toContain("Owned by the Catalog team.");
  });

  it("moves tombstoned concepts too", () => {
    const file = owned("> **Removed.**");
    const result = relayoutBundle(new Map([["types/objects/GiftCard.md", file]]));

    expect(result.files.get("types/GiftCard.md")).toBe(file);
  });

  it("leaves a stray file alone", () => {
    const result = relayoutBundle(new Map([["types/objects/notes.md", "# My notes\n"]]));

    expect(result.files.get("types/objects/notes.md")).toBe("# My notes\n");
    expect(result.moves).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  it("deletes a kind index whose human region is empty", () => {
    const index = assembleFile(
      { preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" },
      EMPTY_HUMAN,
    );
    const result = relayoutBundle(new Map([["types/objects/index.md", index]]));

    expect(result.files.has("types/objects/index.md")).toBe(false);
    expect(result.deletes).toEqual(["types/objects/index.md"]);
    expect(result.redirects).toEqual([]);
  });

  it("deletes a marker-less legacy kind index", () => {
    const result = relayoutBundle(
      new Map([["types/objects/index.md", "# Object types\n\n* [Product](Product.md)\n"]]),
    );

    expect(result.deletes).toEqual(["types/objects/index.md"]);
  });

  it("redirects a kind index that carries human text", () => {
    const index = assembleFile(
      { preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" },
      `\n\n${LEGACY_HUMAN_HINT}\nSee ADR-14.\n`,
    );
    const result = relayoutBundle(new Map([["types/objects/index.md", index]]));

    expect(result.deletes).toEqual([]);
    expect(result.redirects).toHaveLength(1);

    const contents = result.files.get("types/objects/index.md") ?? "";
    expect(contents).toContain(
      "* [Types](/types/index.md) - This directory was flattened into the parent index.",
    );
    expect(contents).not.toContain("Product.md");
    expect(contents).toContain("See ADR-14.");
  });

  it("is a no-op on a second pass over an already-redirected index", () => {
    const index = assembleFile(
      { preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" },
      `\n\n${LEGACY_HUMAN_HINT}\nSee ADR-14.\n`,
    );
    const once = relayoutBundle(new Map([["types/objects/index.md", index]]));
    const twice = relayoutBundle(once.files);

    expect(twice.redirects).toEqual([]);
    expect(twice.deletes).toEqual([]);
    expect(twice.files).toEqual(once.files);
  });

  it("drops a legacy duplicate that is byte-identical to its target", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/Product.md", file],
        ["types/objects/Product.md", file],
      ]),
    );

    expect(result.files.get("types/Product.md")).toBe(file);
    expect(result.deletes).toEqual(["types/objects/Product.md"]);
    expect(result.moves).toEqual([]);
  });

  it("throws when a legacy duplicate differs from its target", () => {
    expect(() =>
      relayoutBundle(
        new Map([
          ["types/Product.md", owned("new")],
          ["types/objects/Product.md", owned("old")],
        ]),
      ),
    ).toThrow(GraphqlOkfError);
  });

  it("throws when two legacy moves collide under case-folding", () => {
    expect(() =>
      relayoutBundle(
        new Map([
          ["types/objects/User.md", owned("object")],
          ["types/inputs/user.md", owned("input")],
        ]),
      ),
    ).toThrow(GraphqlOkfError);
  });

  it("ignores files outside the six legacy kind directories", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/Product.md", file],
        ["queries/product.md", file],
        ["directives/auth.md", file],
        ["index.md", file],
      ]),
    );

    expect(result.moves).toEqual([]);
    expect(result.deletes).toEqual([]);
    expect(result.files).toEqual(
      new Map([
        ["types/Product.md", file],
        ["queries/product.md", file],
        ["directives/auth.md", file],
        ["index.md", file],
      ]),
    );
  });

  it("reports moves and deletes sorted, whatever the map order", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/scalars/DateTime.md", file],
        ["types/enums/Currency.md", file],
        ["types/objects/Address.md", file],
      ]),
    );

    expect(result.moves.map((move) => move.from)).toEqual([
      "types/enums/Currency.md",
      "types/objects/Address.md",
      "types/scalars/DateTime.md",
    ]);
    expect(result.deletes).toEqual([...result.deletes].sort());
  });
});
