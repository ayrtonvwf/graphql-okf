import { AGENT_MODEL } from "./constants.ts";
import {
  MCP_SERVER_NAME,
  type McpServerEntry,
  type RunContext,
  type Scenario,
} from "./scenarios.ts";

/**
 * One prompt for all three scenarios. It must not hint at what context exists:
 * naming a bundle, a tool, or even "GraphQL" would move a second variable.
 */
export const SHARED_SYSTEM_PROMPT = [
  "You are a software engineer working in the given directory.",
  "Complete the user's task using the files and tools available to you.",
  "Do not ask clarifying questions; there is nobody available to answer them.",
].join(" ");

/** No Bash: the fixture is untyped, so command execution buys variance, not signal. */
export const SHARED_TOOLS: readonly string[] = Object.freeze([
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
]);

export const MAX_TURNS = 40;

export interface QueryOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: string[];
  readonly allowedTools: string[];
  readonly maxTurns: number;
  readonly cwd: string;
  readonly permissionMode: "bypassPermissions";
  readonly settingSources: never[];
  readonly mcpServers: Record<string, McpServerEntry>;
}

export interface BuildQueryOptionsArgs {
  readonly cwd: string;
  readonly scenario: Scenario;
  readonly ctx: RunContext;
}

/**
 * The single place a run's agent configuration is built. Every field except
 * `mcpServers` and the MCP entry in `allowedTools` is identical across
 * scenarios — that is the property the benchmark rests on.
 */
export function buildQueryOptions({ cwd, scenario, ctx }: BuildQueryOptionsArgs): QueryOptions {
  const mcpServers = scenario.mcpServers(ctx);
  const allowedTools = [...SHARED_TOOLS];
  if (Object.keys(mcpServers).length > 0) {
    allowedTools.push(`mcp__${MCP_SERVER_NAME}__*`);
  }

  return {
    model: AGENT_MODEL,
    systemPrompt: SHARED_SYSTEM_PROMPT,
    tools: [...SHARED_TOOLS],
    allowedTools,
    maxTurns: MAX_TURNS,
    cwd,
    permissionMode: "bypassPermissions",
    // Without this the SDK loads user/project/local settings — including this
    // repo's CLAUDE.md — into the agent under test, contaminating every run.
    settingSources: [],
    mcpServers,
  };
}
