import { describe, expect, it } from "vitest";
import type { Rubric } from "./cases.ts";
import { scoreRubric } from "./scoring.ts";

const rubric: Rubric = {
  criteria: [
    { id: "a", weight: 3, statement: "A" },
    { id: "b", weight: 1, statement: "B" },
  ],
};

describe("scoreRubric", () => {
  it("returns 1 when every criterion passes", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: true, justification: "" },
      ]),
    ).toBe(1);
  });

  it("returns 0 when every criterion fails", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: false, justification: "" },
        { id: "b", passed: false, justification: "" },
      ]),
    ).toBe(0);
  });

  it("weights criteria rather than counting them", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: false, justification: "" },
      ]),
    ).toBe(0.75);
  });

  it("treats a criterion the judge omitted as failed", () => {
    expect(scoreRubric(rubric, [{ id: "a", passed: true, justification: "" }])).toBe(0.75);
  });

  it("ignores outcomes for criteria the rubric does not define", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: true, justification: "" },
        { id: "ghost", passed: true, justification: "" },
      ]),
    ).toBe(1);
  });

  it("throws on a zero-weight rubric rather than dividing by zero", () => {
    expect(() => scoreRubric({ criteria: [] }, [])).toThrow(/weight/i);
  });
});
