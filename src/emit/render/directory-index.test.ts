import { describe, expect, it } from "vitest";
import { renderDirectoryIndex } from "./directory-index.js";
import { assembleFile, EMPTY_HUMAN } from "./seam.js";

describe("renderDirectoryIndex", () => {
  it("puts the title in the preamble and the bullets in the generated region", () => {
    const parts = renderDirectoryIndex("Object types", [
      {
        entries: [
          { label: "Country", link: "Country.md", summary: "An ISO country." },
          { label: "Language", link: "Language.md", summary: "A spoken language." },
        ],
      },
    ]);

    expect(parts.preamble).toBe("# Object types\n\n");
    expect(parts.generated).toBe(
      "\n* [Country](Country.md) - An ISO country.\n* [Language](Language.md) - A spoken language.\n",
    );
  });

  it("assembles into a file whose human region is preserved on re-runs", () => {
    const parts = renderDirectoryIndex("Types", [
      {
        entries: [{ label: "objects/", link: "objects/index.md", summary: "Object types" }],
      },
    ]);

    const file = assembleFile(parts, EMPTY_HUMAN);

    expect(file).toContain("# Types");
    expect(file).toContain("* [objects/](objects/index.md) - Object types");
    expect(file).toContain("<!-- graphql-okf:generated:end -->");
    expect(file.trimEnd().endsWith("-->")).toBe(true);
  });

  it("omits the summary dash when a summary is empty", () => {
    const parts = renderDirectoryIndex("Types", [
      {
        entries: [{ label: "widgets/", link: "widgets/index.md", summary: "" }],
      },
    ]);

    expect(parts.generated).toContain("* [widgets/](widgets/index.md)");
    expect(parts.generated).not.toContain("—");
  });

  it("uses the OKF §6 bullet and separator", () => {
    const parts = renderDirectoryIndex("Object types", [
      {
        entries: [{ label: "Country", link: "Country.md", summary: "An ISO country." }],
      },
    ]);

    expect(parts.generated).toContain("* [Country](Country.md) - An ISO country.");
  });

  it("omits the separator when there is no summary", () => {
    const parts = renderDirectoryIndex("Object types", [
      {
        entries: [{ label: "Country", link: "Country.md", summary: "" }],
      },
    ]);

    expect(parts.generated).toContain("* [Country](Country.md)\n");
    expect(parts.generated).not.toContain(" - ");
  });

  it("emits a frontmatter block above the title when given one", () => {
    const parts = renderDirectoryIndex("API interface", [{ entries: [] }], {
      frontmatter: ['okf_version: "0.1"', 'resource: "https://api.test/graphql"'],
    });

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
    expect(renderDirectoryIndex("Object types", [{ entries: [] }]).preamble).toBe(
      "# Object types\n\n",
    );
  });

  it("emits a heading above each section that has one", () => {
    const parts = renderDirectoryIndex("Types", [
      {
        heading: "Object types",
        entries: [{ label: "Country", link: "/types/Country.md", summary: "An ISO country." }],
      },
      {
        heading: "Scalar types",
        entries: [{ label: "ID", link: "/types/ID.md", summary: "An opaque identifier." }],
      },
    ]);

    expect(parts.generated).toBe(
      [
        "",
        "## Object types",
        "",
        "* [Country](/types/Country.md) - An ISO country.",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md) - An opaque identifier.",
        "",
      ].join("\n"),
    );
  });

  it("renders a headingless section as a bare list, ahead of headed ones", () => {
    const parts = renderDirectoryIndex("Types", [
      {
        entries: [{ label: "objects/", link: "/types/index.md", summary: "Object types" }],
      },
      { heading: "Scalar types", entries: [{ label: "ID", link: "/types/ID.md", summary: "" }] },
    ]);

    expect(parts.generated).toBe(
      [
        "",
        "* [objects/](/types/index.md) - Object types",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md)",
        "",
      ].join("\n"),
    );
  });

  it("skips a section with no entries rather than emitting a bare heading", () => {
    const parts = renderDirectoryIndex("Types", [
      { heading: "Object types", entries: [] },
      { heading: "Scalar types", entries: [{ label: "ID", link: "/types/ID.md", summary: "" }] },
    ]);

    expect(parts.generated).not.toContain("Object types");
    expect(parts.generated).toBe("\n## Scalar types\n\n* [ID](/types/ID.md)\n");
  });

  describe("the options object", () => {
    it("puts a note above the bullets, inside the generated region", () => {
      const parts = renderDirectoryIndex(
        "API interface",
        [{ entries: [{ label: "types/", link: "/types/index.md", summary: "Types" }] }],
        { frontmatter: ['okf_version: "0.2"'], note: "Built-ins have no concept files." },
      );

      expect(parts.preamble).toBe('---\nokf_version: "0.2"\n---\n\n# API interface\n\n');
      expect(parts.generated).toBe(
        "\nBuilt-ins have no concept files.\n\n* [types/](/types/index.md) - Types\n",
      );
    });

    it("renders exactly as before when no note is given", () => {
      const parts = renderDirectoryIndex(
        "Types",
        [{ entries: [{ label: "Country", link: "/types/Country.md", summary: "A country." }] }],
        { frontmatter: ['okf_version: "0.2"'] },
      );

      expect(parts.generated).toBe("\n* [Country](/types/Country.md) - A country.\n");
    });
  });
});
