import { describe, expect, it } from "vitest";
import { cell, collapse } from "./text.js";

describe("collapse", () => {
  it("turns a paragraph break into a single space", () => {
    expect(collapse("A product.\n\nMay contain Markdown.")).toBe(
      "A product. May contain Markdown.",
    );
  });

  it("turns a wrapped line into a single space", () => {
    expect(collapse("A country in the\n  ISO registry.")).toBe("A country in the ISO registry.");
  });

  it("trims leading and trailing whitespace", () => {
    expect(collapse("  padded  ")).toBe("padded");
  });

  it("leaves a single-line string untouched", () => {
    expect(collapse("Already one line.")).toBe("Already one line.");
  });
});

describe("cell", () => {
  it("escapes a pipe so it cannot break out of a table row", () => {
    expect(cell("Either a | or a comma.")).toBe("Either a \\| or a comma.");
  });

  it("collapses newlines as well", () => {
    expect(cell("One.\n\nTwo | three.")).toBe("One. Two \\| three.");
  });
});
