import { describe, expect, it } from "vitest";
import { aggregate, mean, median, renderSummary } from "./aggregate.js";
import type { JudgeResult, RunResult } from "./result.js";

function run(overrides: Partial<RunResult> & Pick<RunResult, "runId">): RunResult {
  return {
    caseId: "qa",
    scenarioId: "baseline",
    trial: 1,
    status: "ok",
    usage: {
      inputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 100,
    },
    startedAt: "2026-07-28T00:00:00.000Z",
    durationMs: 1,
    agentModel: "claude-sonnet-5",
    ...overrides,
  };
}

function judged(runId: string, score: number): JudgeResult {
  return { runId, caseId: "qa", score, criteria: [], judgeModel: "claude-opus-5" };
}

describe("median", () => {
  it("returns the middle value of an odd-length set", () => {
    expect(median([0.2, 0.9, 0.5])).toBe(0.5);
  });

  it("averages the two middle values of an even-length set", () => {
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5);
  });

  it("handles a single value", () => {
    expect(median([0.42])).toBe(0.42);
  });

  it("throws on an empty set", () => {
    expect(() => median([])).toThrow(/empty/i);
  });
});

describe("mean", () => {
  it("averages", () => {
    expect(mean([100, 200, 300])).toBe(200);
  });

  it("throws on an empty set", () => {
    expect(() => mean([])).toThrow(/empty/i);
  });
});

describe("aggregate", () => {
  it("reports the median accuracy and mean tokens for a cell", () => {
    const runs = [
      run({ runId: "qa__baseline__t1", trial: 1 }),
      run({
        runId: "qa__baseline__t2",
        trial: 2,
        usage: {
          inputTokens: 300,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 300,
        },
      }),
      run({
        runId: "qa__baseline__t3",
        trial: 3,
        usage: {
          inputTokens: 200,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 200,
        },
      }),
    ];
    const judgements = [
      judged("qa__baseline__t1", 0.2),
      judged("qa__baseline__t2", 0.9),
      judged("qa__baseline__t3", 0.5),
    ];

    const cell = aggregate(runs, judgements).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBe(0.5);
    expect(cell?.meanTotalTokens).toBe(200);
    expect(cell?.trials).toBe(3);
    expect(cell?.erroredTrials).toBe(0);
  });

  it("excludes errored runs from aggregates instead of scoring them zero", () => {
    const runs = [
      run({ runId: "qa__baseline__t1", trial: 1 }),
      run({
        runId: "qa__baseline__t2",
        trial: 2,
        status: "error",
        error: "boom",
        usage: undefined,
      }),
    ];
    const judgements = [judged("qa__baseline__t1", 1)];

    const cell = aggregate(runs, judgements).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBe(1);
    expect(cell?.trials).toBe(1);
    expect(cell?.erroredTrials).toBe(1);
  });

  it("reports null accuracy for a cell whose runs are unjudged", () => {
    const cell = aggregate([run({ runId: "qa__baseline__t1" })], []).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBeNull();
    expect(cell?.meanTotalTokens).toBe(100);
  });

  it("reports nulls for a cell with no runs at all", () => {
    const cell = aggregate([], []).find(
      (s) => s.caseId === "add-review" && s.scenarioId === "okf-bundle",
    );
    expect(cell?.medianAccuracy).toBeNull();
    expect(cell?.meanTotalTokens).toBeNull();
    expect(cell?.trials).toBe(0);
  });

  it("covers all nine cells", () => {
    expect(aggregate([], []).length).toBe(9);
  });
});

describe("renderSummary", () => {
  it("renders a markdown table including the manifest", () => {
    const md = renderSummary(aggregate([], []), { agentModel: "claude-sonnet-5" });
    expect(md).toContain("# Benchmark results");
    expect(md).toContain("claude-sonnet-5");
    expect(md).toContain("| okf-bundle |");
    expect(md).toContain("n/a");
  });
});
