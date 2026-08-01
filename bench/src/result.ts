import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RESULTS_DIR } from "./constants.ts";
import type { TokenUsage } from "./usage.ts";

export type RunStatus = "ok" | "error";

/** One executed cell of the matrix. The unit the runner writes and the judge reads. */
export interface RunResult {
  readonly runId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly trial: number;
  readonly status: RunStatus;
  readonly error?: string;
  readonly usage?: TokenUsage;
  readonly costUsd?: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly agentModel: string;
}

export interface CriterionOutcome {
  readonly id: string;
  readonly passed: boolean;
  readonly justification: string;
}

/** One graded artifact. Committed — this is the evidence behind any published number. */
export interface JudgeResult {
  readonly runId: string;
  readonly caseId: string;
  /** Weighted pass fraction in [0, 1]. */
  readonly score: number;
  readonly criteria: readonly CriterionOutcome[];
  readonly judgeModel: string;
}

export function runDir(runId: string): string {
  return join(RESULTS_DIR, runId);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string, label: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, "utf8");
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`${label} is not readable JSON: ${(cause as Error).message}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

function require<T>(source: Record<string, unknown>, key: string, label: string): T {
  const value = source[key];
  if (value === undefined) {
    throw new Error(`${label} is missing required field "${key}"`);
  }
  return value as T;
}

export async function writeRunResult(result: RunResult): Promise<void> {
  const dir = runDir(result.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "run.json"), result);
}

export async function readRunResult(runId: string): Promise<RunResult> {
  const path = join(runDir(runId), "run.json");
  const raw = await readJson(path, runId);
  return {
    runId: require<string>(raw, "runId", runId),
    caseId: require<string>(raw, "caseId", runId),
    scenarioId: require<string>(raw, "scenarioId", runId),
    trial: require<number>(raw, "trial", runId),
    status: require<RunStatus>(raw, "status", runId),
    error: raw["error"] as string | undefined,
    usage: raw["usage"] as TokenUsage | undefined,
    costUsd: raw["costUsd"] as number | undefined,
    startedAt: require<string>(raw, "startedAt", runId),
    durationMs: require<number>(raw, "durationMs", runId),
    agentModel: require<string>(raw, "agentModel", runId),
  };
}

export async function runResultExists(runId: string): Promise<boolean> {
  return exists(join(runDir(runId), "run.json"));
}

export async function listRunResults(): Promise<RunResult[]> {
  let entries: string[];
  try {
    entries = await readdir(RESULTS_DIR);
  } catch {
    return [];
  }
  const results: RunResult[] = [];
  for (const entry of entries.sort()) {
    if (await runResultExists(entry)) {
      results.push(await readRunResult(entry));
    }
  }
  return results;
}

export async function writeJudgeResult(result: JudgeResult): Promise<void> {
  const dir = runDir(result.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "judge.json"), result);
}

export async function readJudgeResult(runId: string): Promise<JudgeResult> {
  const path = join(runDir(runId), "judge.json");
  const raw = await readJson(path, runId);
  return {
    runId: require<string>(raw, "runId", runId),
    caseId: require<string>(raw, "caseId", runId),
    score: require<number>(raw, "score", runId),
    criteria: require<CriterionOutcome[]>(raw, "criteria", runId),
    judgeModel: require<string>(raw, "judgeModel", runId),
  };
}

export async function judgeResultExists(runId: string): Promise<boolean> {
  return exists(join(runDir(runId), "judge.json"));
}
