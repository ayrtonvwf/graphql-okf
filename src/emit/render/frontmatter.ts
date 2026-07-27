import { firstSentence } from "../../model/description.js";
import type { ConceptNode } from "../../model/ir.js";
import { TYPE_LABEL_BY_KIND } from "../../model/naming.js";
import type { EmitContext } from "../context.js";

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
  lines.push(`timestamp: ${JSON.stringify(ctx.timestamp)}`);
  lines.push("---", "");
  return lines.join("\n");
}
