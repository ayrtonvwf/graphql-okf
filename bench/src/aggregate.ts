import { CASES, type CaseId } from "./cases.ts";
import { SCENARIO_IDS, type ScenarioId } from "./matrix.ts";
import type { JudgeResult, RunResult } from "./result.ts";

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot take the median of an empty set");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot take the mean of an empty set");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface CellSummary {
  readonly caseId: CaseId;
  readonly scenarioId: ScenarioId;
  /** Successful trials only. */
  readonly trials: number;
  readonly erroredTrials: number;
  /** Median across successful, judged trials; null when there are none. */
  readonly medianAccuracy: number | null;
  /** Mean across successful trials; null when there are none. */
  readonly meanTotalTokens: number | null;
}

/**
 * Errored cells are excluded, never counted as zero: a harness failure recorded
 * as a zero score reads as a model failure and would quietly bias the result.
 */
export function aggregate(
  runs: readonly RunResult[],
  judgements: readonly JudgeResult[],
): CellSummary[] {
  const scoreByRunId = new Map(judgements.map((j) => [j.runId, j.score]));
  const summaries: CellSummary[] = [];

  for (const benchCase of CASES) {
    for (const scenarioId of SCENARIO_IDS) {
      const cellRuns = runs.filter((r) => r.caseId === benchCase.id && r.scenarioId === scenarioId);
      const ok = cellRuns.filter((r) => r.status === "ok");
      const scores = ok
        .map((r) => scoreByRunId.get(r.runId))
        .filter((s): s is number => s !== undefined);
      const tokens = ok
        .map((r) => r.usage?.totalTokens)
        .filter((t): t is number => t !== undefined);

      summaries.push({
        caseId: benchCase.id,
        scenarioId,
        trials: ok.length,
        erroredTrials: cellRuns.length - ok.length,
        medianAccuracy: scores.length > 0 ? median(scores) : null,
        meanTotalTokens: tokens.length > 0 ? mean(tokens) : null,
      });
    }
  }
  return summaries;
}

function accuracyCell(summary: CellSummary): string {
  return summary.medianAccuracy === null ? "n/a" : summary.medianAccuracy.toFixed(2);
}

function tokenCell(summary: CellSummary): string {
  return summary.meanTotalTokens === null
    ? "n/a"
    : Math.round(summary.meanTotalTokens).toLocaleString("en-US");
}

export function renderSummary(
  summaries: readonly CellSummary[],
  manifest: Record<string, string>,
): string {
  const lines: string[] = ["# Benchmark results", ""];

  lines.push("| Field | Value |", "| --- | --- |");
  for (const [key, value] of Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");

  lines.push(
    "Accuracy is the median weighted-rubric score across successful trials; tokens are the mean total per run. Errored trials are excluded from both.",
    "",
  );

  for (const benchCase of CASES) {
    lines.push(`## ${benchCase.id}`, "");
    lines.push(
      "| Scenario | Median accuracy | Mean tokens | Trials | Errored |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const scenarioId of SCENARIO_IDS) {
      const summary = summaries.find(
        (s) => s.caseId === benchCase.id && s.scenarioId === scenarioId,
      );
      if (summary === undefined) continue;
      lines.push(
        `| ${scenarioId} | ${accuracyCell(summary)} | ${tokenCell(summary)} | ${summary.trials} | ${summary.erroredTrials} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
