import { describe, expect, it } from "vitest";
import { PRODUCER } from "../version.js";
import { DEFAULT_OKF_VERSION, emitContext, isOkfVersion } from "./context.js";

const T = "2026-07-27T09:00:00.000Z";

describe("emitContext", () => {
  it("carries the version, the timestamp and the producer identity", () => {
    expect(emitContext("0.2", T)).toEqual({
      okfVersion: "0.2",
      timestamp: T,
      producer: PRODUCER,
    });
  });

  it("is frozen, so no renderer can mutate a shared run context", () => {
    expect(Object.isFrozen(emitContext("0.1", T))).toBe(true);
  });
});

describe("isOkfVersion", () => {
  it("accepts the supported versions", () => {
    expect(isOkfVersion("0.1")).toBe(true);
    expect(isOkfVersion("0.2")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isOkfVersion("0.3")).toBe(false);
    expect(isOkfVersion("")).toBe(false);
    expect(isOkfVersion("v0.2")).toBe(false);
  });
});

describe("DEFAULT_OKF_VERSION", () => {
  it("is 0.2", () => {
    expect(DEFAULT_OKF_VERSION).toBe("0.2");
  });
});
