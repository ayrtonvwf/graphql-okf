import { describe, expect, it } from "vitest";
import { textOf } from "./runner.ts";

/**
 * `textOf` reads assistant text out of the SDK's message envelope. Its shape
 * has regressed once already (an SDK bump moved the content array and
 * silently produced an empty `artifact.txt` for every answer-kind case,
 * discovered only by a live run) — these tests pin the current shape and
 * the defensive fallback so the next SDK bump fails a unit test instead of
 * a benchmark run.
 */
describe("textOf", () => {
  it("extracts text from message.message.content array of text blocks", () => {
    const message = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "world" },
        ],
      },
    };
    expect(textOf(message)).toBe("Hello\nworld");
  });

  it("skips non-text blocks (e.g. tool_use) interleaved with text", () => {
    const message = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Reading the file now." },
          { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "a.ts" } },
        ],
      },
    };
    expect(textOf(message)).toBe("Reading the file now.");
  });

  it("returns empty string for a message with no text blocks", () => {
    const message = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }],
      },
    };
    expect(textOf(message)).toBe("");
  });

  it("returns empty string when message.message.content is missing", () => {
    const message = { type: "assistant", message: { role: "assistant" } };
    expect(textOf(message)).toBe("");
  });

  it("does not crash on a malformed/unexpected shape", () => {
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
    expect(textOf("a string")).toBe("");
    expect(textOf(42)).toBe("");
    expect(textOf({})).toBe("");
    expect(textOf({ message: null })).toBe("");
  });

  it("falls back to a top-level content array (older SDK shape) when message.content is absent", () => {
    const message = {
      type: "assistant",
      content: [{ type: "text", text: "fallback text" }],
    };
    expect(textOf(message)).toBe("fallback text");
  });

  it("prefers message.message.content over a top-level content field when both are present", () => {
    const message = {
      type: "assistant",
      message: { content: [{ type: "text", text: "nested wins" }] },
      content: [{ type: "text", text: "top-level loses" }],
    };
    expect(textOf(message)).toBe("nested wins");
  });
});
