import { fileURLToPath } from "node:url";
import type { ScenarioId } from "./matrix.js";
import { generateBundle } from "./workspace.js";

/**
 * The GraphQL MCP product under test. Recorded in the run manifest so any
 * published number is traceable to the server that produced it.
 *
 * Requirement: it must introspect a live endpoint, not load an SDL file.
 *
 * `mcp-graphql` (https://github.com/blurrah/mcp-graphql) is a stdio process,
 * not an HTTP server — it has no `--http` mode, only a `bin` entrypoint that
 * speaks MCP over stdio and introspects the endpoint given via the `ENDPOINT`
 * env var. See the widened `McpServerEntry` union below.
 */
export const MCP_SERVER_PACKAGE = "mcp-graphql";
export const MCP_SERVER_VERSION = "2.0.4";

/** The name the server is registered under; tools become `mcp__graphql__*`. */
export const MCP_SERVER_NAME = "graphql";

/**
 * Absolute path to the installed `mcp-graphql` entrypoint, resolved once at
 * module load through normal node_modules resolution. Spawning it as
 * `process.execPath <this path>` rather than relying on the bare `mcp-graphql`
 * command being on `PATH` keeps the benchmark runnable regardless of the
 * working directory or shell environment the SDK spawns it from — the harness
 * copies each scenario's workspace to an isolated temp directory (see
 * `workspace.ts`), so `bench/node_modules/.bin` cannot be assumed to be on
 * `PATH` there.
 */
const MCP_GRAPHQL_ENTRYPOINT = fileURLToPath(import.meta.resolve("mcp-graphql/dist/index.js"));

/**
 * `mcp-graphql` is a stdio MCP server, not an HTTP endpoint: it is invoked as
 * a local process and configured entirely through environment variables. The
 * shape below matches `McpStdioServerConfig` from
 * `@anthropic-ai/claude-agent-sdk`'s `coreTypes.d.ts` (`type?: 'stdio';
 * command: string; args?: string[]; env?: Record<string, string>`), so this
 * is exactly what Task 11 will pass through to the SDK's `mcpServers` option
 * unmodified.
 */
export type McpServerEntry = {
  readonly type: "stdio";
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
};

/** Per-invocation facts a scenario may consult. */
export interface RunContext {
  /** The mock server's endpoint. Present whenever a graphql-mcp cell is scheduled. */
  readonly endpointUrl?: string;
}

/**
 * A scenario may influence a run through exactly these two members. There is
 * deliberately no field for system prompt, model, tools, or turn limit: those
 * are shared by every scenario, which is what makes the comparison honest.
 */
export interface Scenario {
  readonly id: ScenarioId;
  setupWorkspace(dir: string, ctx: RunContext): Promise<void>;
  mcpServers(ctx: RunContext): Record<string, McpServerEntry>;
}

async function noSetup(): Promise<void> {
  // Intentionally empty: this scenario contributes nothing to the workspace.
}

function noServers(): Record<string, McpServerEntry> {
  return {};
}

export const SCENARIOS: readonly Scenario[] = Object.freeze([
  {
    id: "okf-bundle",
    async setupWorkspace(dir: string): Promise<void> {
      await generateBundle(dir);
    },
    mcpServers: noServers,
  },
  {
    id: "graphql-mcp",
    setupWorkspace: noSetup,
    mcpServers(ctx: RunContext): Record<string, McpServerEntry> {
      if (ctx.endpointUrl === undefined) {
        throw new Error("graphql-mcp needs an endpoint URL; the mock server was not started");
      }
      return {
        [MCP_SERVER_NAME]: {
          type: "stdio",
          command: process.execPath,
          args: [MCP_GRAPHQL_ENTRYPOINT],
          // mcp-graphql disables mutations by default; two of the three
          // benchmark cases (add-review, cancel-reason) require the agent to
          // call a mutation, so this must be set for the comparison to be fair.
          env: { ENDPOINT: ctx.endpointUrl, ALLOW_MUTATIONS: "true" },
        },
      };
    },
  },
  {
    id: "baseline",
    setupWorkspace: noSetup,
    mcpServers: noServers,
  },
]);

export function scenarioById(id: string): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(
      `Unknown scenario "${id}". Known scenarios: ${SCENARIOS.map((s) => s.id).join(", ")}`,
    );
  }
  return found;
}

/** The mock server is started only when the scheduled matrix actually needs it. */
export function needsEndpoint(scenarioIds: readonly ScenarioId[]): boolean {
  return scenarioIds.includes("graphql-mcp");
}
