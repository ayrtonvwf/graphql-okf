import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregate, renderSummary } from "./aggregate.ts";
import { RESULTS_DIR } from "./constants.ts";
import { buildManifest } from "./manifest.ts";
import { judgeResultExists, listRunResults, readJudgeResult } from "./result.ts";

async function main(): Promise<void> {
  const runs = await listRunResults();
  const judgements = [];
  for (const run of runs) {
    if (await judgeResultExists(run.runId)) {
      judgements.push(await readJudgeResult(run.runId));
    }
  }

  const manifest = await buildManifest();
  const summaries = aggregate(runs, judgements);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    join(RESULTS_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  const summary = renderSummary(summaries, manifest);
  await writeFile(join(RESULTS_DIR, "summary.md"), summary, "utf8");

  console.log(summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
