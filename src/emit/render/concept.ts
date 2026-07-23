import type { ConceptNode } from "../../model/ir.js";
import { renderBody } from "./body.js";
import { renderFrontmatter } from "./frontmatter.js";

export const GENERATED_START = "<!-- graphql-okf:generated:start -->";
export const GENERATED_END = "<!-- graphql-okf:generated:end -->";

const GENERATED_HINT =
  "<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->";
const HUMAN_HINT =
  "<!-- Human-authored content below this line is preserved across regenerations. -->";

export function renderConcept(concept: ConceptNode, resource: string, timestamp: string): string {
  return [
    renderFrontmatter(concept, resource, timestamp),
    GENERATED_START,
    GENERATED_HINT,
    "",
    renderBody(concept).trimEnd(),
    "",
    GENERATED_END,
    "",
    HUMAN_HINT,
    "",
  ].join("\n");
}
