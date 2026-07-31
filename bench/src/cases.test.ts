import { describe, expect, it } from "vitest";
import { CASES, caseById, loadPrompt, loadRubric } from "./cases.js";

describe("cases", () => {
  it("declares exactly the three specified cases", () => {
    expect(CASES.map((c) => c.id)).toEqual(["qa", "add-review", "cancel-reason"]);
  });

  it("marks qa as an answer case needing no fixture", () => {
    const qa = caseById("qa");
    expect(qa.artifactKind).toBe("answer");
    expect(qa.needsFixture).toBe(false);
  });

  it("marks both coding cases as diff cases needing the fixture", () => {
    for (const id of ["add-review", "cancel-reason"]) {
      const c = caseById(id);
      expect(c.artifactKind).toBe("diff");
      expect(c.needsFixture).toBe(true);
    }
  });

  it("rejects an unknown case id", () => {
    expect(() => caseById("nope")).toThrow(/unknown case/i);
  });

  it("loads a non-empty prompt for every case", async () => {
    for (const c of CASES) {
      expect((await loadPrompt(c.id)).trim().length).toBeGreaterThan(0);
    }
  });

  it("loads a rubric with positive weights and unique ids for every case", async () => {
    for (const c of CASES) {
      const rubric = await loadRubric(c.id);
      expect(rubric.criteria.length).toBeGreaterThan(0);
      const ids = rubric.criteria.map((crit) => crit.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const crit of rubric.criteria) {
        expect(crit.weight).toBeGreaterThan(0);
        expect(crit.statement.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every case a heavily weighted no-fabrication criterion", async () => {
    for (const c of CASES) {
      const rubric = await loadRubric(c.id);
      const fabrication = rubric.criteria.find(
        (crit) => crit.id === "no-fabricated-schema-elements",
      );
      expect(fabrication, `${c.id} must guard against fabrication`).toBeDefined();
      const others = rubric.criteria.filter((crit) => crit.id !== "no-fabricated-schema-elements");
      for (const other of others) {
        expect(fabrication?.weight).toBeGreaterThanOrEqual(other.weight);
      }
    }
  });
});
