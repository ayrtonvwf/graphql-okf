import type { AppliedDirective, ConceptNode, InputValueNode, TypeRef } from "../../model/ir.js";
import { bundleLink } from "./links.js";

/**
 * One outbound edge. `label` is what the reader sees; `sortKey` is the bare name,
 * so a directive files under its own letter rather than under `@`.
 */
type Edge = { readonly sortKey: string; readonly label: string; readonly path: string };

function typeEdge(ref: TypeRef): Edge[] {
  return ref.path === null ? [] : [{ sortKey: ref.name, label: `\`${ref.name}\``, path: ref.path }];
}

function directiveEdges(applied: readonly AppliedDirective[]): Edge[] {
  return applied.flatMap((directive) =>
    directive.path === null
      ? []
      : [{ sortKey: directive.name, label: `\`@${directive.name}\``, path: directive.path }],
  );
}

function inputValueEdges(values: readonly InputValueNode[]): Edge[] {
  return values.flatMap((value) => [
    ...typeEdge(value.type),
    ...directiveEdges(value.appliedDirectives),
  ]);
}

/**
 * Every concept a concept points at. `implementedBy` is deliberately absent: it
 * is the reverse edge, carried by its own prose line, and merging it here would
 * assert that an interface references its implementors.
 */
function edgesOf(concept: ConceptNode): Edge[] {
  const own = directiveEdges(concept.appliedDirectives);

  switch (concept.kind) {
    case "object":
    case "interface":
      return [
        ...own,
        ...concept.interfaces.flatMap(typeEdge),
        ...concept.fields.flatMap((field) => [
          ...typeEdge(field.type),
          ...directiveEdges(field.appliedDirectives),
          ...inputValueEdges(field.args),
        ]),
      ];
    case "input":
      return [...own, ...inputValueEdges(concept.fields)];
    case "enum":
      return [
        ...own,
        ...concept.values.flatMap((value) => directiveEdges(value.appliedDirectives)),
      ];
    case "union":
      return [...own, ...concept.members.flatMap(typeEdge)];
    case "scalar":
      return own;
    case "query":
    case "mutation":
    case "subscription":
      return [...own, ...typeEdge(concept.type), ...inputValueEdges(concept.args)];
    case "directive":
      return [...own, ...inputValueEdges(concept.args)];
  }
}

/**
 * The links an SDL block cannot hold, gathered onto one line beneath it.
 *
 * OKF §6.1 is explicit that a link asserts a relationship, and consumers that
 * build a graph view read links as its edges. Leaving them derivable from the
 * naming scheme would make them edges only for a consumer that has implemented
 * our naming scheme, and would leave `GOAL-7.2`'s no-dangling-link invariant
 * with nothing to check.
 */
export function referencesLine(concept: ConceptNode): readonly string[] {
  const byPath = new Map<string, Edge>();
  for (const edge of edgesOf(concept)) {
    if (!byPath.has(edge.path)) {
      byPath.set(edge.path, edge);
    }
  }
  if (byPath.size === 0) {
    return [];
  }

  const sorted = [...byPath.values()].sort((left, right) => {
    const leftLower = left.sortKey.toLowerCase();
    const rightLower = right.sortKey.toLowerCase();
    if (leftLower !== rightLower) {
      return leftLower < rightLower ? -1 : 1;
    }
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });

  const links = sorted.map((edge) => `[${edge.label}](${bundleLink(edge.path)})`);
  return ["", `References: ${links.join(", ")}.`];
}
