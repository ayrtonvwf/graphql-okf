import type { ConceptNode } from "../../model/ir.js";

export function renderFrontmatter(
  concept: ConceptNode,
  resource: string,
  timestamp: string,
): string {
  const tags = ["graphql", concept.kind].map((tag) => JSON.stringify(tag)).join(", ");
  const lines = [
    "---",
    `type: ${JSON.stringify(concept.kind)}`,
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
