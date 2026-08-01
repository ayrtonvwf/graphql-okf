import { describe, expect, it } from "vitest";
import { internalLinkTargets, resolveBundleLink } from "./bundle-links.js";

describe("internalLinkTargets", () => {
  it("finds bundle-internal targets", () => {
    const text = "See [`Money`](Money.md) and [`ID`](/types/scalars/ID.md).";

    expect(internalLinkTargets(text)).toEqual(["Money.md", "/types/scalars/ID.md"]);
  });

  it("skips external links and pure fragments", () => {
    const text = "[docs](https://example.test) [here](#schema) [`X`](/types/X.md)";

    expect(internalLinkTargets(text)).toEqual(["/types/X.md"]);
  });

  it("returns targets in source order and keeps duplicates", () => {
    const text = "[a](/types/A.md) [b](/types/B.md) [a again](/types/A.md)";

    expect(internalLinkTargets(text)).toEqual(["/types/A.md", "/types/B.md", "/types/A.md"]);
  });
});

describe("resolveBundleLink", () => {
  it("resolves an absolute target against the bundle root", () => {
    expect(resolveBundleLink("types/objects/Product.md", "/types/scalars/ID.md")).toBe(
      "types/scalars/ID.md",
    );
  });

  it("resolves an absolute target the same way from any depth", () => {
    expect(resolveBundleLink("index.md", "/types/scalars/ID.md")).toBe("types/scalars/ID.md");
  });

  it("resolves a sibling relative target", () => {
    expect(resolveBundleLink("types/objects/Product.md", "Money.md")).toBe(
      "types/objects/Money.md",
    );
  });

  it("resolves an ascending relative target", () => {
    expect(resolveBundleLink("types/objects/Product.md", "../scalars/ID.md")).toBe(
      "types/scalars/ID.md",
    );
  });
});
