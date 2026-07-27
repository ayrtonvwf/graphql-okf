import { firstSentence } from "../../model/description.js";
import type { ConceptNode } from "../../model/ir.js";
import { TYPE_LABEL_BY_KIND } from "../../model/naming.js";
import type { EmitContext } from "../context.js";

/**
 * OKF §5.1 provenance. v0.2 §13.1 replaced v0.1's flat `timestamp` with a
 * `generated` mapping; `by` is required within it, `at` is the content's last
 * meaningful change. Written as a flow mapping, matching the spec's own example.
 */
export function renderProvenance(ctx: EmitContext): string {
  if (ctx.okfVersion === "0.1") {
    return `timestamp: ${JSON.stringify(ctx.timestamp)}`;
  }
  return `generated: { by: ${JSON.stringify(ctx.producer)}, at: ${JSON.stringify(ctx.timestamp)} }`;
}

export function renderFrontmatter(
  concept: ConceptNode,
  resource: string,
  ctx: EmitContext,
): string {
  const tags = ["graphql", concept.kind].map((tag) => JSON.stringify(tag)).join(", ");
  const lines = [
    "---",
    `type: ${JSON.stringify(TYPE_LABEL_BY_KIND[concept.kind])}`,
    `title: ${JSON.stringify(concept.name)}`,
  ];
  const description = firstSentence(concept.description);
  if (description !== null) {
    lines.push(`description: ${JSON.stringify(description)}`);
  }
  lines.push(`resource: ${JSON.stringify(resource)}`);
  lines.push(`tags: [${tags}]`);
  lines.push(renderProvenance(ctx));
  lines.push("---", "");
  return lines.join("\n");
}
