import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_MODEL, FIXED_NOW, JUDGE_MODEL, SCHEMA_PATH } from "./constants.ts";

describe("constants", () => {
  it("pins the exact model ids", () => {
    expect(AGENT_MODEL).toBe("claude-sonnet-5");
    expect(JUDGE_MODEL).toBe("claude-opus-5");
  });

  it("pins a fixed timestamp so bundle emission is byte-stable", () => {
    expect(FIXED_NOW).toBe("2026-01-01T00:00:00Z");
  });

  it("points at the shop-api v3 schema that actually exists", () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true);
  });
});
