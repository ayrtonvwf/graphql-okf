import { describe, expect, it } from "vitest";
import { createOkfBundle } from "./index.js";

describe("createOkfBundle", () => {
  it("throws until GOAL-M1 is implemented", () => {
    expect(() => createOkfBundle({ outDir: "." })).toThrow(
      "graphql-okf: not implemented yet (GOAL-M1 in progress)",
    );
  });
});
