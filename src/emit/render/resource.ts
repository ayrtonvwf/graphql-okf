import type { ConceptNode } from "../../model/ir.js";

function anchorFor(concept: ConceptNode): string {
  switch (concept.kind) {
    case "query":
    case "mutation":
    case "subscription":
      return `${concept.rootTypeName}.${concept.name}`;
    case "directive":
      return `@${concept.name}`;
    default:
      return concept.name;
  }
}

/**
 * OKF §4.1 defines `resource` as a URI that uniquely identifies the underlying
 * asset. A bundle-wide origin identifies nothing, so each concept anchors on
 * the schema element it describes. The bundle-wide origin lives on the root
 * index instead.
 */
export function conceptResource(origin: string, concept: ConceptNode): string {
  const base = origin.split("#")[0] ?? origin;
  return `${base}#${anchorFor(concept)}`;
}
