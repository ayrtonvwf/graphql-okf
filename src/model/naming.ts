export type ConceptKind =
  | "object"
  | "interface"
  | "union"
  | "enum"
  | "input"
  | "scalar"
  | "query"
  | "mutation"
  | "subscription"
  | "directive";

export const DIRECTORY_BY_KIND: Record<ConceptKind, string> = {
  object: "types/objects",
  interface: "types/interfaces",
  union: "types/unions",
  enum: "types/enums",
  input: "types/inputs",
  scalar: "types/scalars",
  query: "queries",
  mutation: "mutations",
  subscription: "subscriptions",
  directive: "directives",
};

export type ElementName = {
  readonly kind: ConceptKind;
  readonly name: string;
};

export function elementId(element: ElementName): string {
  return `${element.kind}:${element.name}`;
}

export function resolvePaths(elements: readonly ElementName[]): ReadonlyMap<string, string> {
  const paths = new Map<string, string>();
  for (const element of elements) {
    const directory = DIRECTORY_BY_KIND[element.kind];
    paths.set(elementId(element), `${directory}/${element.name}.md`);
  }
  return paths;
}
