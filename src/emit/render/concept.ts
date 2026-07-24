import type { ConceptNode } from "../../model/ir.js";
import { renderBody } from "./body.js";
import { renderFrontmatter } from "./frontmatter.js";
import { assembleFile, EMPTY_HUMAN, type FileParts, GENERATED_HINT } from "./seam.js";

export function renderConceptParts(
  concept: ConceptNode,
  resource: string,
  timestamp: string,
): FileParts {
  return {
    preamble: `${renderFrontmatter(concept, resource, timestamp)}\n`,
    generated: `\n${GENERATED_HINT}\n\n${renderBody(concept).trimEnd()}\n\n`,
  };
}

export function renderConcept(concept: ConceptNode, resource: string, timestamp: string): string {
  return assembleFile(renderConceptParts(concept, resource, timestamp), EMPTY_HUMAN);
}
