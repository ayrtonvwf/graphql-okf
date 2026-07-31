import type { PreToolUseHookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  buildQueryOptions,
  createPreToolUseHook,
  MAX_TURNS,
  SHARED_SYSTEM_PROMPT,
  SHARED_TOOLS,
} from "./agent-config.ts";
import { scenarioById } from "./scenarios.ts";

/** Stub for the third `HookCallback` argument. */
const fakeHookOptions = {
  signal: new AbortController().signal,
};

/** Builds a minimal `PreToolUseHookInput` for a given tool call. */
function preToolUseInput(toolName: string, toolInput: unknown): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "test-tool-use",
    session_id: "test-session",
    transcript_path: "/tmp/transcript.jsonl",
    cwd: "/tmp/ws",
  };
}

describe("shared system prompt", () => {
  it("names no scenario, tool, bundle, or schema", () => {
    const lowered = SHARED_SYSTEM_PROMPT.toLowerCase();
    for (const marker of ["okf", "bundle", "mcp", "introspect", "graphql", "schema", "baseline"]) {
      expect(lowered, `system prompt must not mention "${marker}"`).not.toContain(marker);
    }
  });

  it("is non-empty", () => {
    expect(SHARED_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });
});

describe("shared tools", () => {
  it("grants edit capability but never command execution", () => {
    expect([...SHARED_TOOLS].sort()).toEqual(["Edit", "Glob", "Grep", "Read", "Write"]);
    expect(SHARED_TOOLS).not.toContain("Bash");
  });
});

describe("buildQueryOptions", () => {
  const base = { cwd: "/tmp/ws", scenario: scenarioById("baseline"), ctx: {} };

  it("pins the agent model", () => {
    expect(buildQueryOptions(base).model).toBe("claude-sonnet-5");
  });

  it("disables filesystem settings so no CLAUDE.md leaks into the agent", () => {
    expect(buildQueryOptions(base).settingSources).toEqual([]);
  });

  it("uses the shared prompt, tools, and turn cap for every scenario", () => {
    for (const id of ["okf-bundle", "graphql-mcp", "baseline"]) {
      const ctx = id === "graphql-mcp" ? { endpointUrl: "http://127.0.0.1:1/graphql" } : {};
      const options = buildQueryOptions({ cwd: "/tmp/ws", scenario: scenarioById(id), ctx });
      expect(options.systemPrompt).toBe(SHARED_SYSTEM_PROMPT);
      expect(options.tools).toEqual([...SHARED_TOOLS]);
      expect(options.maxTurns).toBe(MAX_TURNS);
      expect(options.model).toBe("claude-sonnet-5");
    }
  });

  it("differs between scenarios only in mcpServers and allowedTools", () => {
    const baseline = buildQueryOptions(base);
    const mcp = buildQueryOptions({
      cwd: "/tmp/ws",
      scenario: scenarioById("graphql-mcp"),
      ctx: { endpointUrl: "http://127.0.0.1:4000/graphql" },
    });

    const differing = Object.keys(baseline).filter(
      (key) =>
        JSON.stringify((baseline as unknown as Record<string, unknown>)[key]) !==
        JSON.stringify((mcp as unknown as Record<string, unknown>)[key]),
    );
    expect(differing.sort()).toEqual(["allowedTools", "mcpServers"]);
  });

  it("allows the registered mcp server's tools", () => {
    const options = buildQueryOptions({
      cwd: "/tmp/ws",
      scenario: scenarioById("graphql-mcp"),
      ctx: { endpointUrl: "http://127.0.0.1:4000/graphql" },
    });
    expect(options.allowedTools).toContain("mcp__graphql__*");
  });

  it("sets the workspace as the working directory", () => {
    expect(buildQueryOptions({ ...base, cwd: "/tmp/other" }).cwd).toBe("/tmp/other");
  });

  it("wires a PreToolUse hook confined to cwd", () => {
    const options = buildQueryOptions(base);
    expect(options.hooks.PreToolUse).toHaveLength(1);
    expect(options.hooks.PreToolUse?.[0]?.hooks).toHaveLength(1);
    expect(typeof options.hooks.PreToolUse?.[0]?.hooks[0]).toBe("function");
  });
});

describe("createPreToolUseHook", () => {
  const cwd = "/tmp/ws-1";
  const hook = createPreToolUseHook(cwd);

  async function decide(toolName: string, toolInput: unknown): Promise<SyncHookJSONOutput> {
    const result = await hook(
      preToolUseInput(toolName, toolInput),
      "test-tool-use",
      fakeHookOptions,
    );
    return result as SyncHookJSONOutput;
  }

  function permissionDecisionOf(result: SyncHookJSONOutput): string | undefined {
    return result.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? result.hookSpecificOutput.permissionDecision
      : undefined;
  }

  function reasonOf(result: SyncHookJSONOutput): string | undefined {
    return result.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? result.hookSpecificOutput.permissionDecisionReason
      : undefined;
  }

  it("allows a Read call with file_path inside cwd", async () => {
    const result = await decide("Read", { file_path: "/tmp/ws-1/schema.graphql" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("denies a Read call with file_path outside cwd", async () => {
    const result = await decide("Read", { file_path: "/etc/passwd" });
    expect(permissionDecisionOf(result)).toBe("deny");
    expect(reasonOf(result)).toContain("escapes the assigned workspace");
  });

  it("denies a Read call that escapes cwd via ../..", async () => {
    const result = await decide("Read", { file_path: "/tmp/ws-1/../../etc/passwd" });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("denies a Glob call whose path argument resolves outside cwd", async () => {
    const result = await decide("Glob", { pattern: "**/*.ts", path: "/tmp/other" });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("denies a Grep call whose path argument resolves outside cwd", async () => {
    const result = await decide("Grep", { pattern: "secret", path: "/tmp/ws-1/../ws-2" });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("allows a Glob call with no path argument (defaults to cwd)", async () => {
    const result = await decide("Glob", { pattern: "**/*.ts" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("allows a Grep call with no path argument (defaults to cwd)", async () => {
    const result = await decide("Grep", { pattern: "secret" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("does not false-positive on a sibling directory sharing a string prefix", async () => {
    // "/tmp/ws-10/foo" starts with the *string* "/tmp/ws-1" but is not under it.
    const result = await decide("Read", { file_path: "/tmp/ws-10/foo" });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("allows a Write call with file_path inside cwd", async () => {
    const result = await decide("Write", { file_path: "/tmp/ws-1/notes.md", content: "hi" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("denies an Edit call with file_path outside cwd", async () => {
    const result = await decide("Edit", {
      file_path: "/tmp/ws-2/notes.md",
      old_string: "a",
      new_string: "b",
    });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("allows a relative file_path that resolves inside cwd", async () => {
    const result = await decide("Read", { file_path: "notes.md" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("denies a relative file_path that resolves outside cwd", async () => {
    const result = await decide("Read", { file_path: "../ws-2/notes.md" });
    expect(permissionDecisionOf(result)).toBe("deny");
  });

  it("allows a non-file-touching tool call unconditionally", async () => {
    const result = await decide("mcp__graphql__introspect", { anything: "/etc/passwd" });
    expect(permissionDecisionOf(result)).toBeUndefined();
  });

  it("ignores non-PreToolUse hook input (defensive narrowing)", async () => {
    const nonPreToolUse = {
      hook_event_name: "PostToolUse",
      session_id: "test-session",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp/ws",
      tool_name: "Read",
      tool_input: { file_path: "/etc/passwd" },
      tool_response: {},
    };
    const result = await hook(
      nonPreToolUse as unknown as PreToolUseHookInput,
      "test-tool-use",
      fakeHookOptions,
    );
    expect(result).toEqual({});
  });
});
