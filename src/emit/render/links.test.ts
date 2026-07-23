import { describe, expect, it } from "vitest";
import type { TypeRef } from "../../model/ir.js";
import { decoratedType, relLink, typeLink } from "./links.js";

const ref = (name: string, path: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path,
  wrappers,
});

describe("decoratedType", () => {
  it("renders a bare type", () => {
    expect(decoratedType(ref("Int", "types/scalars/Int.md"))).toBe("Int");
  });

  it("renders non-null and list wrappers outermost-first", () => {
    expect(decoratedType(ref("Language", "x", ["nonNull", "list", "nonNull"]))).toBe(
      "[Language!]!",
    );
  });

  it("renders nested lists", () => {
    expect(decoratedType(ref("Int", "x", ["list", "list"]))).toBe("[[Int]]");
  });
});

describe("relLink", () => {
  it("links to a sibling file", () => {
    expect(relLink("types/objects/Country.md", "types/objects/Language.md")).toBe("Language.md");
  });

  it("links across sibling directories", () => {
    expect(relLink("types/objects/Country.md", "types/scalars/ID.md")).toBe("../scalars/ID.md");
  });

  it("links from a top-level directory into a nested one", () => {
    expect(relLink("queries/languages.md", "types/objects/Language.md")).toBe(
      "../types/objects/Language.md",
    );
  });
});

describe("typeLink", () => {
  it("wraps the decorated type in a code-formatted markdown link", () => {
    const t = ref("Language", "types/objects/Language.md", ["nonNull", "list", "nonNull"]);
    expect(typeLink("queries/languages.md", t)).toBe(
      "[`[Language!]!`](../types/objects/Language.md)",
    );
  });
});
