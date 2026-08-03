import { describe, expect, it } from "vitest";
import type { TypeRef } from "../../model/ir.js";
import { bundleLink, decoratedType, typeLink } from "./links.js";

const ref = (name: string, path: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path,
  wrappers,
});

describe("decoratedType", () => {
  it("renders a bare type", () => {
    expect(decoratedType(ref("Int", "types/Int.md"))).toBe("Int");
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

describe("bundleLink", () => {
  it("prefixes a bundle path with a slash", () => {
    expect(bundleLink("types/Language.md")).toBe("/types/Language.md");
  });

  it("does not depend on where the link is written from", () => {
    expect(bundleLink("types/ID.md")).toBe("/types/ID.md");
  });

  it("handles a bundle-root file", () => {
    expect(bundleLink("index.md")).toBe("/index.md");
  });
});

describe("typeLink", () => {
  it("wraps the decorated type in a code-formatted markdown link", () => {
    const t = ref("Language", "types/Language.md", ["nonNull", "list", "nonNull"]);

    expect(typeLink(t)).toBe("[`[Language!]!`](/types/Language.md)");
  });
});
