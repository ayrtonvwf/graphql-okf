import type { DirectiveDefinitionNode, OperationNode } from "../../model/ir.js";
import { decoratedType } from "./links.js";
import { inlineArgumentList } from "./sdl.js";

export function operationSignature(node: OperationNode): string {
  return `${node.name}${inlineArgumentList(node.args)}: ${decoratedType(node.type)}`;
}

/**
 * Locations are already sorted by `project.ts`, so this prints them as the IR
 * holds them and cannot disagree with `body.ts`'s `Locations:` line. GraphQL
 * requires at least one location, so there is no empty case to branch on.
 */
export function directiveSignature(node: DirectiveDefinitionNode): string {
  const repeatable = node.isRepeatable ? " repeatable" : "";
  return `@${node.name}${inlineArgumentList(node.args)}${repeatable} on ${node.locations.join(" | ")}`;
}
