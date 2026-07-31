import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { caseById, loadRubric } from "./cases.ts";
import { JUDGE_MODEL } from "./constants.ts";
import { judgeArtifact } from "./judge.ts";
import { judgeResultExists, listRunResults, runDir, writeJudgeResult } from "./result.ts";
import { scoreRubric } from "./scoring.ts";

/** Fisher-Yates. Run order is shuffled so grading cannot drift with matrix order. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY === undefined) {
    throw new Error("ANTHROPIC_API_KEY is not set; refusing to start a paid judging pass");
  }

  // See run.ts's parse() for why the literal `--` pnpm forwards must be stripped.
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const { values } = parseArgs({ args, options: { force: { type: "boolean", default: false } } });
  const force = values.force === true;

  const runs = (await listRunResults()).filter((r) => r.status === "ok");
  const pending: typeof runs = [];
  for (const run of runs) {
    if (force || !(await judgeResultExists(run.runId))) pending.push(run);
  }

  console.log(`${runs.length} successful runs, ${pending.length} to judge.`);

  for (const [index, run] of shuffle(pending).entries()) {
    const benchCase = caseById(run.caseId);
    const filename = benchCase.artifactKind === "answer" ? "artifact.txt" : "artifact.diff";
    process.stdout.write(`[${index + 1}/${pending.length}] ${run.runId} ... `);
    try {
      const artifact = await readFile(join(runDir(run.runId), filename), "utf8");
      const criteria = await judgeArtifact(benchCase.id, artifact);
      const score = scoreRubric(await loadRubric(benchCase.id), criteria);
      await writeJudgeResult({
        runId: run.runId,
        caseId: benchCase.id,
        score,
        criteria,
        judgeModel: JUDGE_MODEL,
      });
      console.log(`scored ${score.toFixed(2)}`);
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
