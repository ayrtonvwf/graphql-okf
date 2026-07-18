import { createHash } from "node:crypto";
import { GraphqlOkfError } from "../errors.js";

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

const RESERVED_BASENAMES = new Set(["index", "log"]);

function shortHash(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}

export function resolvePaths(elements: readonly ElementName[]): ReadonlyMap<string, string> {
  const byDirectory = new Map<string, ElementName[]>();
  for (const element of elements) {
    const directory = DIRECTORY_BY_KIND[element.kind];
    const bucket = byDirectory.get(directory);
    if (bucket === undefined) {
      byDirectory.set(directory, [element]);
    } else {
      bucket.push(element);
    }
  }

  const paths = new Map<string, string>();

  for (const [directory, bucket] of byDirectory) {
    const foldCounts = new Map<string, number>();
    for (const element of bucket) {
      const fold = element.name.toLowerCase();
      foldCounts.set(fold, (foldCounts.get(fold) ?? 0) + 1);
    }

    const takenFolds = new Map<string, string>();

    for (const element of bucket) {
      const fold = element.name.toLowerCase();
      const collides = (foldCounts.get(fold) ?? 0) > 1;
      const reserved = RESERVED_BASENAMES.has(fold);
      const basename =
        collides || reserved ? `${element.name}-${shortHash(element.name)}` : element.name;

      const basenameFold = basename.toLowerCase();
      const previous = takenFolds.get(basenameFold);
      /* v8 ignore next 7 -- defensive: unreachable for any legal GraphQL schema, see note below */
      if (previous !== undefined && previous !== element.name) {
        throw new GraphqlOkfError(
          "NAME_HASH_COLLISION",
          `"${previous}" and "${element.name}" both resolve to ${directory}/${basename}.md. ` +
            "Rename one of them in the schema.",
        );
      }
      takenFolds.set(basenameFold, element.name);

      paths.set(elementId(element), `${directory}/${basename}.md`);
    }
  }

  return paths;
}
