import type { DirectiveDefinitionNode, InputValueNode, OperationNode } from "../../model/ir.js";
import { decoratedType } from "./links.js";

/**
 * The SDL argument list. Empty parentheses are not SDL, so an element with no
 * arguments renders as a bare `name: Type`. `decoratedType` rather than
 * `typeLink`: a signature is a code span, and a Markdown code span cannot hold a
 * link (see the issue #21 design).
 */
function argumentList(args: readonly InputValueNode[]): string {
  if (args.length === 0) {
    return "";
  }
  const rendered = args.map((arg) => {
    const type = decoratedType(arg.type);
    return arg.defaultValue === null
      ? `${arg.name}: ${type}`
      : `${arg.name}: ${type} = ${arg.defaultValue}`;
  });
  return `(${rendered.join(", ")})`;
}

export function operationSignature(node: OperationNode): string {
  return `${node.name}${argumentList(node.args)}: ${decoratedType(node.type)}`;
}

/**
 * Locations are already sorted by `project.ts`, so this prints them as the IR
 * holds them and cannot disagree with `body.ts`'s `Locations:` line. GraphQL
 * requires at least one location, so there is no empty case to branch on.
 */
export function directiveSignature(node: DirectiveDefinitionNode): string {
  const repeatable = node.isRepeatable ? " repeatable" : "";
  return `@${node.name}${argumentList(node.args)}${repeatable} on ${node.locations.join(" | ")}`;
}
