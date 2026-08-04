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

/**
 * Type kinds all share `types/`. GraphQL keeps every named type in one
 * namespace, so a name is unique within it by construction; the kind is carried
 * by `type:` frontmatter (GOAL-5.3) and by a heading in `types/index.md`.
 * Directive names and root operation field names occupy separate namespaces that
 * *can* collide with type names, so those directories stay distinct.
 */
export const DIRECTORY_BY_KIND: Record<ConceptKind, string> = {
  object: "types",
  interface: "types",
  union: "types",
  enum: "types",
  input: "types",
  scalar: "types",
  query: "queries",
  mutation: "mutations",
  subscription: "subscriptions",
  directive: "directives",
};

/**
 * The canonical order kinds are presented in — currently the group order of a
 * multi-kind `index.md`. An explicit array rather than `Object.keys` of a record:
 * output order is load-bearing (GOAL-8.1) and must not rest on key-insertion
 * order surviving a future edit.
 */
export const KIND_ORDER: readonly ConceptKind[] = [
  "object",
  "interface",
  "union",
  "enum",
  "input",
  "scalar",
  "query",
  "mutation",
  "subscription",
  "directive",
];

/**
 * The `type` value emitted into frontmatter. OKF §4.1 asks for values that are
 * descriptive and self-explanatory; `object` is neither in a shared catalog.
 * `ConceptKind` stays the internal key — only the emitted label lives here.
 */
export const TYPE_LABEL_BY_KIND: Record<ConceptKind, string> = {
  object: "GraphQL Object Type",
  interface: "GraphQL Interface Type",
  union: "GraphQL Union Type",
  enum: "GraphQL Enum Type",
  input: "GraphQL Input Type",
  scalar: "GraphQL Scalar Type",
  query: "GraphQL Query",
  mutation: "GraphQL Mutation",
  subscription: "GraphQL Subscription",
  directive: "GraphQL Directive",
};

export type ElementName = {
  readonly kind: ConceptKind;
  readonly name: string;
};

export function elementId(element: ElementName): string {
  return `${element.kind}:${element.name}`;
}

const RESERVED_BASENAMES = new Set(["index", "log"]);

/**
 * The elements GraphQL's own specification defines. `GOAL-7.3` lets us omit
 * links to built-in scalars under a documented convention; issue #23 extends the
 * same convention to the spec directives, for the same reason — both are prose
 * every model already carries, and every link to one invites a consumer to spend
 * a turn re-reading what it knew before it started.
 *
 * Matching on name is exact, not approximate: GraphQL forbids a schema from
 * redefining a specified scalar or directive, so no custom element can ever carry
 * one of these names in the matching kind. Names are case-sensitive, so a
 * `type id` is a different element from the built-in `ID` and keeps its file.
 */
const SPEC_DEFINED_SCALARS = new Set(["Boolean", "Float", "ID", "Int", "String"]);
const SPEC_DEFINED_DIRECTIVES = new Set(["deprecated", "include", "oneOf", "skip", "specifiedBy"]);

/** Whether this element gets a concept file of its own. See the note above. */
export function hasConceptFile(element: ElementName): boolean {
  if (element.kind === "scalar") {
    return !SPEC_DEFINED_SCALARS.has(element.name);
  }
  if (element.kind === "directive") {
    return !SPEC_DEFINED_DIRECTIVES.has(element.name);
  }
  return true;
}

const SPEC_DEFINED_ELEMENTS: readonly ElementName[] = [
  ...[...SPEC_DEFINED_SCALARS].map((name): ElementName => ({ kind: "scalar", name })),
  ...[...SPEC_DEFINED_DIRECTIVES].map((name): ElementName => ({ kind: "directive", name })),
];

/**
 * The paths spec-defined concepts occupied before issue #23, sorted. Derived by
 * running the same two sets `hasConceptFile` consults through `resolvePaths`,
 * rather than written out: these paths are a function of the current rule, so the
 * prune pre-pass that consumes them cannot drift from the emitter's behaviour.
 * (Contrast `relayout.ts`'s `LEGACY_TYPE_DIRS`, which is a historical fact about
 * bundles on disk and must survive the naming scheme forgetting it.)
 */
export const SPEC_DEFINED_PATHS: readonly string[] = [
  ...resolvePaths(SPEC_DEFINED_ELEMENTS).values(),
].sort();

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
