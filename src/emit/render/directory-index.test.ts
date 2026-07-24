import { describe, expect, it } from "vitest";
import { renderDirectoryIndex } from "./directory-index.js";
import { assembleFile, EMPTY_HUMAN } from "./seam.js";

describe("renderDirectoryIndex", () => {
  it("puts the title in the preamble and the bullets in the generated region", () => {
    const parts = renderDirectoryIndex("Object types", [
      { label: "Country", link: "Country.md", summary: "An ISO country." },
      { label: "Language", link: "Language.md", summary: "A spoken language." },
    ]);

    expect(parts.preamble).toBe("# Object types\n\n");
    expect(parts.generated).toBe(
      "\n- [Country](Country.md) — An ISO country.\n- [Language](Language.md) — A spoken language.\n",
    );
  });

  it("assembles into a file whose human region is preserved on re-runs", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "objects/", link: "objects/index.md", summary: "Object types" },
    ]);

    const file = assembleFile(parts, EMPTY_HUMAN);

    expect(file).toContain("# Types");
    expect(file).toContain("- [objects/](objects/index.md) — Object types");
    expect(file).toContain("<!-- graphql-okf:generated:end -->");
    expect(file.trimEnd().endsWith("-->")).toBe(true);
  });

  it("omits the summary dash when a summary is empty", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "widgets/", link: "widgets/index.md", summary: "" },
    ]);

    expect(parts.generated).toContain("- [widgets/](widgets/index.md)");
    expect(parts.generated).not.toContain("—");
  });
});
