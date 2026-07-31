import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildQueryOptions } from "./agent-config.ts";
import { scenarioById } from "./scenarios.ts";
import { normalizeUsage } from "./usage.ts";

/**
 * One trivial run, printing the raw terminal message. Use it to confirm the
 * SDK's result-message shape before trusting recorded token counts.
 */
async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "okf-bench-probe-"));
  const options = buildQueryOptions({ cwd, scenario: scenarioById("baseline"), ctx: {} });

  for await (const message of query({ prompt: "Reply with the single word: ok", options })) {
    if (message.type === "result") {
      console.log("--- raw result message ---");
      console.log(JSON.stringify(message, null, 2));
      console.log("--- normalised usage ---");
      console.log(JSON.stringify(normalizeUsage(message), null, 2));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
