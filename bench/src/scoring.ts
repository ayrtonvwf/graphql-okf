import type { Rubric } from "./cases.ts";
import type { CriterionOutcome } from "./result.ts";

/**
 * Weighted pass fraction. A criterion the judge failed to report counts as
 * failed: silently dropping it would inflate the score of a judge that lost
 * track of the rubric.
 */
export function scoreRubric(rubric: Rubric, outcomes: readonly CriterionOutcome[]): number {
  const passedIds = new Set(outcomes.filter((o) => o.passed).map((o) => o.id));

  let earned = 0;
  let total = 0;
  for (const criterion of rubric.criteria) {
    total += criterion.weight;
    if (passedIds.has(criterion.id)) earned += criterion.weight;
  }

  if (total <= 0) {
    throw new Error("Rubric has no positive total weight; cannot score it");
  }
  return earned / total;
}
