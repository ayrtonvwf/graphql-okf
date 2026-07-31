import path from "node:path";
import type { HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk";
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

/**
 * Tools that take a filesystem path argument and therefore need confinement
 * to the per-cell workspace. `permissionMode: "bypassPermissions"` (required
 * to run headless without interactive prompts) disables the SDK's own
 * cwd-based path gating, so this is the only thing standing between the
 * agent and the real repo checkout `bench/` lives inside — without it, the
 * `baseline` scenario can find and read the real schema/bundle, making the
 * whole three-way comparison meaningless.
 */
const FILE_TOUCHING_TOOLS: ReadonlySet<string> = new Set(["Read", "Glob", "Grep", "Write", "Edit"]);

/** Argument names the built-in tools use for a path, in priority order. */
const PATH_INPUT_KEYS: readonly string[] = ["file_path", "path", "notebook_path"];

function extractPathArgument(input: Record<string, unknown>): string | undefined {
  for (const key of PATH_INPUT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** True if `resolved` is `cwd` itself or a path underneath it. */
function isWithinCwd(resolved: string, cwd: string): boolean {
  return resolved === cwd || resolved.startsWith(cwd + path.sep);
}

/**
 * Confines file-touching tool calls to the cell's workspace directory via a
 * `PreToolUse` hook. Every scenario shares this via {@link buildQueryOptions}
 * — see the module-level comment on `FILE_TOUCHING_TOOLS` for why it's
 * necessary at all.
 *
 * This MUST be a `PreToolUse` hook, not `canUseTool`: under
 * `permissionMode: "bypassPermissions"` (required to run headless), the SDK
 * auto-approves every tool call before `canUseTool` would ever be consulted
 * — the callback is silently never invoked. `PreToolUse` hooks are honored
 * even under `bypassPermissions` (confirmed against
 * `@anthropic-ai/claude-agent-sdk`'s own `sdk.d.ts` and by live
 * re-verification), so this is the only mechanism that actually fires.
 *
 * The callback is typed as the SDK's generic `HookCallback` (its `input` is
 * the `HookInput` union over every hook event, since the same callback type
 * is shared across all events) but is only ever registered under the
 * `PreToolUse` key in `hooks`, so in practice it only ever receives a
 * `PreToolUseHookInput`. We still narrow explicitly at runtime — the
 * compiler can't infer that from the registration site alone.
 */
export function createPreToolUseHook(cwd: string): HookCallback {
  const resolvedCwd = path.resolve(cwd);

  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return {};
    }

    const { tool_name: toolName, tool_input: toolInput } = input;
    if (!FILE_TOUCHING_TOOLS.has(toolName)) {
      return {};
    }

    const candidate =
      toolInput !== null && typeof toolInput === "object"
        ? extractPathArgument(toolInput as Record<string, unknown>)
        : undefined;
    if (candidate === undefined) {
      // No path argument (e.g. a Glob/Grep call defaulting to cwd): safe.
      return {};
    }

    const resolved = path.resolve(resolvedCwd, candidate);
    if (isWithinCwd(resolved, resolvedCwd)) {
      return {};
    }

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `path escapes the assigned workspace: "${candidate}" resolves to "${resolved}", which is outside "${resolvedCwd}"`,
      },
    };
  };
}

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
  readonly hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
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
    hooks: {
      PreToolUse: [{ hooks: [createPreToolUseHook(cwd)] }],
    },
  };
}
