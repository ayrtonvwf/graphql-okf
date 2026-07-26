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
      "\n* [Country](Country.md) - An ISO country.\n* [Language](Language.md) - A spoken language.\n",
    );
  });

  it("assembles into a file whose human region is preserved on re-runs", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "objects/", link: "objects/index.md", summary: "Object types" },
    ]);

    const file = assembleFile(parts, EMPTY_HUMAN);

    expect(file).toContain("# Types");
    expect(file).toContain("* [objects/](objects/index.md) - Object types");
    expect(file).toContain("<!-- graphql-okf:generated:end -->");
    expect(file.trimEnd().endsWith("-->")).toBe(true);
  });

  it("omits the summary dash when a summary is empty", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "widgets/", link: "widgets/index.md", summary: "" },
    ]);

    expect(parts.generated).toContain("* [widgets/](widgets/index.md)");
    expect(parts.generated).not.toContain("—");
  });

  it("uses the OKF §6 bullet and separator", () => {
    const parts = renderDirectoryIndex("Object types", [
      { label: "Country", link: "Country.md", summary: "An ISO country." },
    ]);

    expect(parts.generated).toContain("* [Country](Country.md) - An ISO country.");
  });

  it("omits the separator when there is no summary", () => {
    const parts = renderDirectoryIndex("Object types", [
      { label: "Country", link: "Country.md", summary: "" },
    ]);

    expect(parts.generated).toContain("* [Country](Country.md)\n");
    expect(parts.generated).not.toContain(" - ");
  });

  it("emits a frontmatter block above the title when given one", () => {
    const parts = renderDirectoryIndex(
      "API interface",
      [],
      ['okf_version: "0.1"', 'resource: "https://api.test/graphql"'],
    );

    expect(parts.preamble).toBe(
      [
        "---",
        'okf_version: "0.1"',
        'resource: "https://api.test/graphql"',
        "---",
        "",
        "# API interface",
        "",
        "",
      ].join("\n"),
    );
  });

  it("emits no frontmatter block when none is given", () => {
    expect(renderDirectoryIndex("Object types", []).preamble).toBe("# Object types\n\n");
  });
});
