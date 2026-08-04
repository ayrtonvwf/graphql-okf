import type { ConceptNode } from "../../model/ir.js";
import { typeLink } from "./links.js";
import { referencesLine } from "./references.js";
import { sdlBlock } from "./sdl.js";

function descriptionBlock(text: string | null): string[] {
  return text === null ? [] : ["", text];
}

/**
 * The one relationship an element's own SDL cannot state, because it points the
 * other way. Everything else the body used to spell out in prose — implements,
 * applied directives, locations, repeatability, return type, specifiedBy,
 * deprecation — is in the block, where GraphQL puts it.
 */
function implementedByBlock(concept: ConceptNode): string[] {
  if (concept.kind !== "interface" || concept.implementedBy.length === 0) {
    return [];
  }
  const links = concept.implementedBy.map((ref) => typeLink(ref)).join(", ");
  return ["", `Implemented by ${links}.`];
}

/**
 * OKF §4.2 gives `# Schema` conventional meaning and asks producers to favour
 * structural markdown, naming fenced code blocks alongside tables. SDL is the
 * notation a GraphQL schema is written in, so the section holds one (issue #24).
 * This is a second H1 below the title, matching §4.3's own example.
 */
function schemaSection(concept: ConceptNode): string[] {
  return [
    "",
    "# Schema",
    "",
    "```graphql",
    ...sdlBlock(concept),
    "```",
    ...referencesLine(concept),
  ];
}

function heading(concept: ConceptNode): string {
  return concept.kind === "directive" ? `# @${concept.name}` : `# ${concept.name}`;
}

export function renderBody(concept: ConceptNode): string {
  return [
    heading(concept),
    ...descriptionBlock(concept.description),
    ...implementedByBlock(concept),
    ...schemaSection(concept),
    "",
  ].join("\n");
}
