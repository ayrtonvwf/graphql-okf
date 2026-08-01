import { parseArgs } from "node:util";
import { buildMatrix, type Cell, filterPending, type ScenarioId } from "./matrix.ts";
import { runResultExists } from "./result.ts";
import { runCell } from "./runner.ts";
import { needsEndpoint, type RunContext, scenarioById } from "./scenarios.ts";
import { type MockServer, startMockServer } from "./server.ts";

function parse(): { cells: Cell[]; force: boolean } {
  // `pnpm run bench -- --case qa ...` forwards a literal `--` into this
  // process's argv (confirmed on pnpm 10.14.0); parseArgs treats a bare `--`
  // as "end of options" and rejects everything after it as positional. Strip
  // it so the documented `pnpm run bench -- --case ...` invocation works.
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: "string" },
      case: { type: "string" },
      trials: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const cells = buildMatrix({
    scenario: values.scenario,
    case: values.case,
    trials: values.trials === undefined ? undefined : Number(values.trials),
  });
  return { cells, force: values.force === true };
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY === undefined) {
    throw new Error("ANTHROPIC_API_KEY is not set; refusing to start a paid run");
  }

  const { cells, force } = parse();
  const pending = await filterPending(cells, runResultExists, force);
  console.log(`${cells.length} cells scheduled, ${pending.length} to run.`);
  if (pending.length === 0) return;

  const scenarioIds = [...new Set(pending.map((c) => c.scenarioId))] as ScenarioId[];
  let server: MockServer | undefined;
  if (needsEndpoint(scenarioIds)) {
    server = await startMockServer();
    console.log(`Mock GraphQL server on ${server.url}`);
  }
  const ctx: RunContext = { endpointUrl: server?.url };

  let totalTokens = 0;
  let errored = 0;
  try {
    for (const [index, cell] of pending.entries()) {
      process.stdout.write(`[${index + 1}/${pending.length}] ${cell.runId} ... `);
      const result = await runCell(cell, scenarioById(cell.scenarioId), ctx);
      if (result.status === "ok") {
        totalTokens += result.usage?.totalTokens ?? 0;
        console.log(`ok (${result.usage?.totalTokens ?? 0} tokens, ${result.durationMs}ms)`);
      } else {
        errored += 1;
        console.log(`ERROR: ${result.error ?? "unknown"}`);
      }
    }
  } finally {
    await server?.stop();
  }

  console.log(`\nDone. ${totalTokens} tokens across ${pending.length} runs, ${errored} errored.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
