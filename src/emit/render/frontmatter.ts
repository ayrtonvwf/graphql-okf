import type { ConceptNode } from "../../model/ir.js";

export function renderFrontmatter(
  concept: ConceptNode,
  resource: string,
  timestamp: string,
): string {
  const lines = ["---", `type: ${concept.kind}`, `title: ${JSON.stringify(concept.name)}`];
  if (concept.description !== null) {
    lines.push(`description: ${JSON.stringify(concept.description)}`);
  }
  lines.push(`resource: ${JSON.stringify(resource)}`);
  lines.push(`tags: [graphql, ${concept.kind}]`);
  lines.push(`timestamp: ${timestamp}`);
  lines.push("---", "");
  return lines.join("\n");
}
