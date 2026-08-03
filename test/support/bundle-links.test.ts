import { describe, expect, it } from "vitest";
import { generatedRegionOf, internalLinkTargets, resolveBundleLink } from "./bundle-links.js";

describe("internalLinkTargets", () => {
  it("finds bundle-internal targets", () => {
    const text = "See [`Money`](Money.md) and [`ID`](/types/ID.md).";

    expect(internalLinkTargets(text)).toEqual(["Money.md", "/types/ID.md"]);
  });

  it("skips external links and pure fragments", () => {
    const text = "[docs](https://example.test) [here](#schema) [`X`](/types/X.md)";

    expect(internalLinkTargets(text)).toEqual(["/types/X.md"]);
  });

  it("returns targets in source order and keeps duplicates", () => {
    const text = "[a](/types/A.md) [b](/types/B.md) [a again](/types/A.md)";

    expect(internalLinkTargets(text)).toEqual(["/types/A.md", "/types/B.md", "/types/A.md"]);
  });

  it("cannot tell a preserved prose link from an emitted one", () => {
    const text = "See the [ordering guide](../guides/ordering.md).";

    expect(internalLinkTargets(text)).toEqual(["../guides/ordering.md"]);
  });
});

describe("resolveBundleLink", () => {
  it("resolves an absolute target against the bundle root", () => {
    expect(resolveBundleLink("types/Product.md", "/types/ID.md")).toBe("types/ID.md");
  });

  it("resolves an absolute target the same way from any depth", () => {
    expect(resolveBundleLink("index.md", "/types/ID.md")).toBe("types/ID.md");
  });

  it("resolves a sibling relative target", () => {
    expect(resolveBundleLink("types/Product.md", "Money.md")).toBe("types/Money.md");
  });

  it("resolves an ascending relative target", () => {
    expect(resolveBundleLink("queries/product.md", "../types/ID.md")).toBe("types/ID.md");
  });
});

describe("generatedRegionOf", () => {
  it("returns the text between the seam markers", () => {
    const text = [
      "---",
      "type: x",
      "---",
      "<!-- graphql-okf:generated:start -->",
      "body [`X`](/types/X.md)",
      "<!-- graphql-okf:generated:end -->",
      "human [notes](../notes.md)",
    ].join("\n");

    expect(generatedRegionOf(text)).toContain("[`X`](/types/X.md)");
    expect(generatedRegionOf(text)).not.toContain("../notes.md");
  });

  it("returns empty for a file with no generated region", () => {
    expect(generatedRegionOf("# Update Log\n\nno markers here")).toBe("");
  });
});
