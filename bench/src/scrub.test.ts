import { describe, expect, it } from "vitest";
import { scrubArtifact } from "./scrub.js";

describe("scrubArtifact", () => {
  it("redacts bundle file paths", () => {
    expect(scrubArtifact("I read okf/shop-api/mutations/addReview.md for this.")).toBe(
      "I read [redacted] for this.",
    );
  });

  it("redacts a leading-slash bundle path", () => {
    expect(scrubArtifact("see /okf/shop-api/index.md")).toBe("see [redacted]");
  });

  it("redacts mcp tool call names", () => {
    expect(scrubArtifact("Calling mcp__graphql__introspect now")).toBe("Calling [redacted] now");
  });

  it("leaves ordinary schema talk untouched", () => {
    const text = "addReview takes productId: ID! and rating: Int!";
    expect(scrubArtifact(text)).toBe(text);
  });

  it("does not mangle the word bundle in prose", () => {
    const text = "The response bundles several fields together.";
    expect(scrubArtifact(text)).toBe(text);
  });

  it("redacts every occurrence, not just the first", () => {
    expect(scrubArtifact("okf/shop-api/a.md and okf/shop-api/b.md")).toBe(
      "[redacted] and [redacted]",
    );
  });

  it("returns an empty string unchanged", () => {
    expect(scrubArtifact("")).toBe("");
  });
});
