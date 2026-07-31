import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

vi.mock("./constants.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.ts")>();
  return {
    ...actual,
    get RESULTS_DIR() {
      return dir;
    },
  };
});

const { readJudgeResult, readRunResult, runResultExists, writeJudgeResult, writeRunResult } =
  await import("./result.ts");

const sample = {
  runId: "qa__baseline__t1",
  caseId: "qa",
  scenarioId: "baseline",
  trial: 1,
  status: "ok" as const,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 15,
  },
  costUsd: 0.01,
  startedAt: "2026-07-28T10:00:00.000Z",
  durationMs: 1234,
  agentModel: "claude-sonnet-5",
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "okf-bench-result-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("run results", () => {
  it("round-trips a run result", async () => {
    await writeRunResult(sample);
    expect(await readRunResult(sample.runId)).toEqual(sample);
  });

  it("reports existence only after a write", async () => {
    expect(await runResultExists(sample.runId)).toBe(false);
    await writeRunResult(sample);
    expect(await runResultExists(sample.runId)).toBe(true);
  });

  it("writes indented JSON so committed results diff readably", async () => {
    await writeRunResult(sample);
    const text = await readFile(join(dir, sample.runId, "run.json"), "utf8");
    expect(text).toContain('\n  "runId"');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("rejects a malformed result file rather than returning junk", async () => {
    await writeRunResult({ ...sample, runId: "bad__baseline__t1" });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "bad__baseline__t1", "run.json"), "{ not json", "utf8");
    await expect(readRunResult("bad__baseline__t1")).rejects.toThrow(/bad__baseline__t1/);
  });

  it("rejects a result file missing required fields", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(dir, "empty__baseline__t1"), { recursive: true });
    await writeFile(join(dir, "empty__baseline__t1", "run.json"), "{}", "utf8");
    await expect(readRunResult("empty__baseline__t1")).rejects.toThrow(/missing/i);
  });
});

describe("judge results", () => {
  it("round-trips a judge result", async () => {
    const judged = {
      runId: sample.runId,
      caseId: "qa",
      score: 0.75,
      criteria: [{ id: "c1", passed: true, justification: "names addReview" }],
      judgeModel: "claude-opus-5",
    };
    await writeRunResult(sample);
    await writeJudgeResult(judged);
    expect(await readJudgeResult(sample.runId)).toEqual(judged);
  });
});
