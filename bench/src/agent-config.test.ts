import { describe, expect, it } from "vitest";
import {
  buildQueryOptions,
  MAX_TURNS,
  SHARED_SYSTEM_PROMPT,
  SHARED_TOOLS,
} from "./agent-config.ts";
import { scenarioById } from "./scenarios.ts";

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
});
