import { describe, expect, it } from "vitest";
import { renderDirectoryIndex } from "./directory-index.js";

describe("renderDirectoryIndex", () => {
  it("renders a title and one bullet per entry", () => {
    const out = renderDirectoryIndex("Object types", [
      { label: "Country", link: "Country.md", summary: "An ISO country." },
      { label: "Language", link: "Language.md", summary: "A spoken language." },
    ]);
    expect(out).toBe(
      [
        "# Object types",
        "",
        "- [Country](Country.md) — An ISO country.",
        "- [Language](Language.md) — A spoken language.",
        "",
      ].join("\n"),
    );
  });

  it("omits the summary dash when a summary is empty", () => {
    const out = renderDirectoryIndex("Types", [
      { label: "objects/", link: "objects/index.md", summary: "Object types" },
    ]);
    expect(out).toContain("- [objects/](objects/index.md) — Object types");
  });
});
