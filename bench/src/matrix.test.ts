import { describe, expect, it } from "vitest";
import { buildMatrix, filterPending, formatRunId, SCENARIO_IDS } from "./matrix.ts";

describe("formatRunId", () => {
  it("builds the documented run id shape", () => {
    expect(formatRunId("add-review", "okf-bundle", 2)).toBe("add-review__okf-bundle__t2");
  });
});

describe("buildMatrix", () => {
  it("produces 27 cells for the full first pass", () => {
    expect(buildMatrix({}).length).toBe(27);
  });

  it("covers every scenario and case combination exactly three times", () => {
    const cells = buildMatrix({});
    for (const scenarioId of SCENARIO_IDS) {
      for (const caseId of ["qa", "add-review", "cancel-reason"]) {
        const matching = cells.filter((c) => c.scenarioId === scenarioId && c.caseId === caseId);
        expect(matching.map((c) => c.trial)).toEqual([1, 2, 3]);
      }
    }
  });

  it("emits unique run ids", () => {
    const ids = buildMatrix({}).map((c) => c.runId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters by scenario", () => {
    const cells = buildMatrix({ scenario: "baseline" });
    expect(cells.length).toBe(9);
    expect(cells.every((c) => c.scenarioId === "baseline")).toBe(true);
  });

  it("filters by case", () => {
    const cells = buildMatrix({ case: "qa" });
    expect(cells.length).toBe(9);
    expect(cells.every((c) => c.caseId === "qa")).toBe(true);
  });

  it("honours a reduced trial count", () => {
    expect(buildMatrix({ trials: 1 }).length).toBe(9);
  });

  it("combines filters", () => {
    const cells = buildMatrix({ scenario: "okf-bundle", case: "add-review", trials: 2 });
    expect(cells.map((c) => c.runId)).toEqual([
      "add-review__okf-bundle__t1",
      "add-review__okf-bundle__t2",
    ]);
  });

  it("rejects an unknown scenario", () => {
    expect(() => buildMatrix({ scenario: "nope" })).toThrow(/unknown scenario/i);
  });

  it("rejects an unknown case", () => {
    expect(() => buildMatrix({ case: "nope" })).toThrow(/unknown case/i);
  });

  it("rejects a non-positive trial count", () => {
    expect(() => buildMatrix({ trials: 0 })).toThrow(/trials/i);
  });
});

describe("filterPending", () => {
  const cells = buildMatrix({ case: "qa", scenario: "baseline" });

  it("drops cells whose result already exists", async () => {
    const done = async (runId: string) => runId.endsWith("t1");
    const pending = await filterPending(cells, done, false);
    expect(pending.map((c) => c.trial)).toEqual([2, 3]);
  });

  it("keeps every cell when forced", async () => {
    const pending = await filterPending(cells, async () => true, true);
    expect(pending.length).toBe(3);
  });

  it("keeps every cell when nothing is done", async () => {
    const pending = await filterPending(cells, async () => false, false);
    expect(pending.length).toBe(3);
  });
});
