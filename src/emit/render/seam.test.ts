import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, GENERATED_END, GENERATED_START } from "./seam.js";

describe("assembleFile", () => {
  it("concatenates preamble, markers, generated content, and the human region", () => {
    const out = assembleFile({ preamble: "# Title\n\n", generated: "\nbody\n" }, "\n\ntrailing\n");

    expect(out).toBe(`# Title\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\ntrailing\n`);
  });

  it("starts a fresh file's human region empty (issue #24)", () => {
    expect(EMPTY_HUMAN).toBe("\n");
  });
});
