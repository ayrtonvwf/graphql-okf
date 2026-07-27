import { describe, expect, it } from "vitest";
import { firstSentence, normalizeDescription } from "./description.js";

describe("normalizeDescription", () => {
  it.each([
    ["undefined", undefined, null],
    ["null", null, null],
    ["an empty string", "", null],
    ["whitespace only", "   \n  ", null],
  ])("maps %s to null", (_label, input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it("trims but otherwise preserves the docstring verbatim", () => {
    expect(normalizeDescription("  First.\n\nSecond paragraph.  ")).toBe(
      "First.\n\nSecond paragraph.",
    );
  });
});

describe("firstSentence", () => {
  it("returns null for null", () => {
    expect(firstSentence(null)).toBeNull();
  });

  it("cuts at the first sentence terminator", () => {
    expect(firstSentence("A country. It has a code.")).toBe("A country.");
  });

  it.each([
    ["a question mark", "Is it cached? Sometimes.", "Is it cached?"],
    ["an exclamation mark", "Careful! This is destructive.", "Careful!"],
  ])("cuts at %s", (_label, input, expected) => {
    expect(firstSentence(input)).toBe(expected);
  });

  it("keeps a trailing terminator at the very end", () => {
    expect(firstSentence("Just one sentence.")).toBe("Just one sentence.");
  });

  it("returns the whole string when there is no terminator", () => {
    expect(firstSentence("no terminator here")).toBe("no terminator here");
  });

  it("collapses a paragraph break into the single-line form before cutting", () => {
    expect(firstSentence("A product.\n\nMay contain Markdown.")).toBe("A product.");
  });

  it("collapses internal newlines when the sentence wraps", () => {
    expect(firstSentence("A country in the\nISO registry. More.")).toBe(
      "A country in the ISO registry.",
    );
  });

  it("does not cut on a decimal point, which is not followed by whitespace", () => {
    expect(firstSentence("Version 1.5 of the API. Next.")).toBe("Version 1.5 of the API.");
  });
});
