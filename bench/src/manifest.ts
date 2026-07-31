import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENT_MODEL, JUDGE_MODEL, REPO_ROOT } from "./constants.ts";
import { MCP_SERVER_PACKAGE, MCP_SERVER_VERSION } from "./scenarios.ts";

const exec = promisify(execFile);

/**
 * Everything needed to trace a published number back to the configuration that
 * produced it. Committed alongside the summary.
 */
export async function buildManifest(): Promise<Record<string, string>> {
  const { stdout } = await exec("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"]);
  return {
    agentModel: AGENT_MODEL,
    judgeModel: JUDGE_MODEL,
    graphqlOkfCommit: stdout.trim(),
    mcpServerPackage: MCP_SERVER_PACKAGE,
    mcpServerVersion: MCP_SERVER_VERSION,
    runDate: new Date().toISOString(),
  };
}
