import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./usage.ts";

describe("normalizeUsage", () => {
  it("reads a flat usage object", () => {
    expect(normalizeUsage({ input_tokens: 100, output_tokens: 20 })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 120,
    });
  });

  it("reads usage nested under a result key", () => {
    expect(
      normalizeUsage({
        result: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 7,
            cache_creation_input_tokens: 3,
          },
        },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 7,
      cacheCreationTokens: 3,
      totalTokens: 25,
    });
  });

  it("counts cache tokens toward the total", () => {
    const usage = normalizeUsage({
      input_tokens: 1,
      output_tokens: 2,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 8,
    });
    expect(usage.totalTokens).toBe(15);
  });

  it("treats missing counters as zero rather than NaN", () => {
    expect(normalizeUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
    });
  });

  it("survives a null or non-object payload", () => {
    expect(normalizeUsage(null).totalTokens).toBe(0);
    expect(normalizeUsage("nonsense").totalTokens).toBe(0);
  });
});
