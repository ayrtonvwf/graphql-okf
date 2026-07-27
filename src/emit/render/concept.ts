import type { ConceptNode } from "../../model/ir.js";
import type { EmitContext } from "../context.js";
import { renderBody } from "./body.js";
import { renderFrontmatter } from "./frontmatter.js";
import { assembleFile, EMPTY_HUMAN, type FileParts, GENERATED_HINT } from "./seam.js";

export function renderConceptParts(
  concept: ConceptNode,
  resource: string,
  ctx: EmitContext,
): FileParts {
  return {
    preamble: `${renderFrontmatter(concept, resource, ctx)}\n`,
    generated: `\n${GENERATED_HINT}\n\n${renderBody(concept).trimEnd()}\n\n`,
  };
}

export function renderConcept(concept: ConceptNode, resource: string, ctx: EmitContext): string {
  return assembleFile(renderConceptParts(concept, resource, ctx), EMPTY_HUMAN);
}
