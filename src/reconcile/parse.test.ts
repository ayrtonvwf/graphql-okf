import { describe, expect, it } from "vitest";
import { assembleFile, GENERATED_END, GENERATED_START } from "../emit/render/seam.js";
import type { GraphqlOkfError } from "../errors.js";
import { splitFile } from "./parse.js";

const file = `---\ntype: object\n---\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\nhuman words\n`;

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  return "no-error";
}

describe("splitFile", () => {
  it("splits an owned file into preamble, generated region, and human region", () => {
    const split = splitFile(file, "types/objects/Country.md");

    expect(split?.parts.preamble).toBe("---\ntype: object\n---\n\n");
    expect(split?.parts.generated).toBe("\nbody\n");
    expect(split?.human).toBe("\n\nhuman words\n");
  });

  it("round-trips exactly, so an unchanged file can be left untouched", () => {
    const split = splitFile(file, "a.md");
    if (split === null) throw new Error("expected an owned file");

    expect(assembleFile(split.parts, split.human)).toBe(file);
  });

  it("returns null for a stray file with no markers", () => {
    expect(splitFile("# Just some notes\n", "guides/notes.md")).toBeNull();
  });

  it("rejects a file with a start marker but no end marker", () => {
    expect(codeOf(() => splitFile(`x\n${GENERATED_START}\ny\n`, "a.md"))).toBe("MALFORMED_CONCEPT");
  });

  it("rejects a file whose markers are out of order", () => {
    expect(codeOf(() => splitFile(`${GENERATED_END}\n${GENERATED_START}\n`, "a.md"))).toBe(
      "MALFORMED_CONCEPT",
    );
  });

  it("rejects a file with duplicated markers", () => {
    const text = `${GENERATED_START}\na\n${GENERATED_END}\n${GENERATED_START}\nb\n${GENERATED_END}\n`;
    expect(codeOf(() => splitFile(text, "a.md"))).toBe("MALFORMED_CONCEPT");
  });

  it("names the offending file in the error message", () => {
    try {
      splitFile(`${GENERATED_START}\n`, "types/objects/Country.md");
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).toContain("types/objects/Country.md");
    }
  });
});
