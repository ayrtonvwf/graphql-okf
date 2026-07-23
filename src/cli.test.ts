import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";
import type { GraphqlOkfError } from "./errors.js";

describe("parseArgs", () => {
  it("treats an http(s) argument as an endpoint source", () => {
    expect(parseArgs(["https://api.test/graphql", "--out", "bundle"])).toEqual({
      source: { kind: "endpoint", url: "https://api.test/graphql" },
      outDir: "bundle",
    });
  });

  it("treats any other argument as an SDL path", () => {
    expect(parseArgs(["./schema.graphql", "--out", "bundle"])).toEqual({
      source: { kind: "sdl", path: "./schema.graphql" },
      outDir: "bundle",
    });
  });

  it("rejects a missing --out", () => {
    const code = (() => {
      try {
        parseArgs(["./schema.graphql"]);
      } catch (error) {
        return (error as GraphqlOkfError).code;
      }
      return "no-error";
    })();
    expect(code).toBe("CLI_USAGE");
  });
});
