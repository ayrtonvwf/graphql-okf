import { describe, expect, it } from "vitest";
import { GraphqlOkfError } from "./errors.js";

describe("GraphqlOkfError", () => {
  it("carries its code, message, and cause", () => {
    const cause = new Error("underlying");
    const error = new GraphqlOkfError("SOURCE_NOT_FOUND", "no such file: a.graphql", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GraphqlOkfError");
    expect(error.code).toBe("SOURCE_NOT_FOUND");
    expect(error.message).toBe("no such file: a.graphql");
    expect(error.cause).toBe(cause);
  });

  it("does not require a cause", () => {
    const error = new GraphqlOkfError("SCHEMA_INVALID", "bad schema");

    expect(error.cause).toBeUndefined();
  });
});
