import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CASES_DIR } from "./constants.ts";

export type CaseId = "qa" | "add-review" | "cancel-reason";

/** What the judge grades: the final answer text, or the workspace diff. */
export type ArtifactKind = "answer" | "diff";

export interface BenchCase {
  readonly id: CaseId;
  readonly artifactKind: ArtifactKind;
  /** Whether the workspace is seeded with a copy of the sample client. */
  readonly needsFixture: boolean;
}

export interface Criterion {
  readonly id: string;
  readonly weight: number;
  readonly statement: string;
}

export interface Rubric {
  readonly criteria: readonly Criterion[];
}

export const CASES: readonly BenchCase[] = Object.freeze([
  { id: "qa", artifactKind: "answer", needsFixture: false },
  { id: "add-review", artifactKind: "diff", needsFixture: true },
  { id: "cancel-reason", artifactKind: "diff", needsFixture: true },
]);

export function caseById(id: string): BenchCase {
  const found = CASES.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`Unknown case "${id}". Known cases: ${CASES.map((c) => c.id).join(", ")}`);
  }
  return found;
}

export async function loadPrompt(id: CaseId): Promise<string> {
  return readFile(join(CASES_DIR, id, "prompt.md"), "utf8");
}

export async function loadRubric(id: CaseId): Promise<Rubric> {
  const text = await readFile(join(CASES_DIR, id, "rubric.json"), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { criteria?: unknown }).criteria)
  ) {
    throw new Error(`Rubric for case "${id}" has no criteria array`);
  }
  return parsed as Rubric;
}
