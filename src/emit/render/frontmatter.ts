import type { ConceptNode } from "../../model/ir.js";
import { TYPE_LABEL_BY_KIND } from "../../model/naming.js";

export function renderFrontmatter(
  concept: ConceptNode,
  resource: string,
  timestamp: string,
): string {
  const tags = ["graphql", concept.kind].map((tag) => JSON.stringify(tag)).join(", ");
  const lines = [
    "---",
    `type: ${JSON.stringify(TYPE_LABEL_BY_KIND[concept.kind])}`,
    `title: ${JSON.stringify(concept.name)}`,
  ];
  if (concept.description !== null) {
    lines.push(`description: ${JSON.stringify(concept.description)}`);
  }
  lines.push(`resource: ${JSON.stringify(resource)}`);
  lines.push(`tags: [${tags}]`);
  lines.push(`timestamp: ${JSON.stringify(timestamp)}`);
  lines.push("---", "");
  return lines.join("\n");
}
