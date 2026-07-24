import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, GENERATED_END, GENERATED_START, HUMAN_HINT } from "./seam.js";

describe("assembleFile", () => {
  it("concatenates preamble, markers, generated content, and the human region", () => {
    const out = assembleFile({ preamble: "# Title\n\n", generated: "\nbody\n" }, "\n\ntrailing\n");

    expect(out).toBe(`# Title\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\ntrailing\n`);
  });

  it("uses the human hint as the starting human region for a fresh file", () => {
    expect(EMPTY_HUMAN).toBe(`\n\n${HUMAN_HINT}\n`);
  });
});
