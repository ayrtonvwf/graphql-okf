import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// @anthropic-ai/sdk's zodOutputFormat() calls zod v4's `z.toJSONSchema()` on the
// schema, which needs the v4-shaped internal `.def` (schemas built from the
// classic "zod" v3 entry point only have `._def` and fail with "reading 'def'").
// zod 3.25+ ships both; import the v4 compat entry so the schema built here has
// the shape the helper expects.
import { z } from "zod/v4";
import { type CaseId, loadRubric } from "./cases.ts";
import { JUDGE_MODEL } from "./constants.ts";
import type { CriterionOutcome } from "./result.ts";
import { scrubArtifact } from "./scrub.ts";

const OutcomesSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      justification: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You are grading a software engineering artifact against a fixed rubric.",
  "Judge each criterion independently and literally: mark it passed only if the artifact",
  "satisfies exactly what the criterion states. Do not reward effort, style, or intent.",
  "Return one entry for every criterion id in the rubric, and no others.",
  "Give a one-sentence justification for each, quoting the artifact where useful.",
].join(" ");

/**
 * Grades one artifact. Receives the rubric and the artifact and nothing else —
 * no scenario name, no transcript, no record of what context the agent had.
 */
export async function judgeArtifact(caseId: CaseId, artifact: string): Promise<CriterionOutcome[]> {
  const rubric = await loadRubric(caseId);
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(OutcomesSchema) },
    messages: [
      {
        role: "user",
        content: [
          "<rubric>",
          JSON.stringify(rubric, null, 2),
          "</rubric>",
          "",
          "<artifact>",
          scrubArtifact(artifact),
          "</artifact>",
        ].join("\n"),
      },
    ],
  });

  const parsed = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new Error(`Judge returned no parseable output for case "${caseId}"`);
  }
  return parsed.criteria;
}
