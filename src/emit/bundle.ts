import { posix } from "node:path";
import { firstSentence } from "../model/description.js";
import type { ConceptNode, SchemaIr } from "../model/ir.js";
import { type ConceptKind, DIRECTORY_BY_KIND, KIND_ORDER } from "../model/naming.js";
import type { EmitContext } from "./context.js";
import { renderConceptParts } from "./render/concept.js";
import {
  type IndexEntry,
  type IndexSection,
  renderDirectoryIndex,
} from "./render/directory-index.js";
import { bundleLink } from "./render/links.js";
import { conceptResource } from "./render/resource.js";
import type { FileParts } from "./render/seam.js";
import { directiveSignature, operationSignature } from "./render/signature.js";

const KIND_SUMMARY: Record<ConceptKind, string> = {
  object: "Object type.",
  interface: "Interface type.",
  union: "Union type.",
  enum: "Enum type.",
  input: "Input object type.",
  scalar: "Scalar type.",
  query: "Query operation.",
  mutation: "Mutation operation.",
  subscription: "Subscription operation.",
  directive: "Directive.",
};

// Title shown as the index H1, and (for a child dir) the summary in its parent's index.
const DIRECTORY_LABELS: Record<string, string> = {
  ".": "API interface",
  types: "Types",
  queries: "Query operations",
  mutations: "Mutation operations",
  subscriptions: "Subscription operations",
  directives: "Directives",
};

/** Heading for a kind's group in an index that holds more than one kind. */
const KIND_SECTION_LABELS: Record<ConceptKind, string> = {
  object: "Object types",
  interface: "Interface types",
  union: "Union types",
  enum: "Enum types",
  input: "Input object types",
  scalar: "Scalar types",
  query: "Query operations",
  mutation: "Mutation operations",
  subscription: "Subscription operations",
  directive: "Directives",
};

/**
 * `GOAL-7.3` permits omitting links to built-in scalars "by a documented
 * convention"; this is that document, on the bundle's own entry point, where an
 * agent walking the tree reads it before it can notice anything missing. A
 * constant rather than a per-schema list: a fixed string is trivially
 * deterministic (`GOAL-8.1`), and the convention holds of the bundle whether or
 * not a given schema happens to exercise it.
 */
export const SPEC_DEFINED_NOTE =
  "Built-in scalars (`Boolean`, `Float`, `ID`, `Int`, `String`) and spec directives " +
  "(`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`) have no concept files: " +
  "they are defined by the GraphQL specification and appear as plain code, not links.";

/**
 * The generated-region contract, stated once (issue #24). It used to be repeated
 * as an HTML comment inside every file, which spent a fifth of a small concept
 * file restating a rule nothing parses. The bundle root is where a consumer who
 * has only the bundle will look for it.
 */
export const SEAM_NOTE =
  "Content between the `graphql-okf:generated` markers is rewritten on every run: " +
  "do not edit inside it. Anything below the end marker is yours and is preserved.";

/**
 * `GOAL-7.3`'s "documented convention", applied to signatures. It sits on every
 * index that carries one rather than only on the root: an agent frequently enters
 * at `queries/index.md` without passing through the root, and a convention it
 * never read is a convention that does not exist. `/types/index.md` is named as
 * the authority because `resolvePaths` hashes a basename when two type names
 * differ only by case, so the `<Name>.md` form is the rule, not a guarantee.
 */
export const SIGNATURE_NOTE =
  "Signatures are GraphQL SDL. A type name in a signature is a concept file at " +
  `\`/${DIRECTORY_BY_KIND.object}/<Name>.md\`; ` +
  `\`/${DIRECTORY_BY_KIND.object}/index.md\` lists them all.`;

function signatureOf(concept: ConceptNode): string | null {
  switch (concept.kind) {
    case "query":
    case "mutation":
    case "subscription":
      return operationSignature(concept);
    case "directive":
      return directiveSignature(concept);
    default:
      return null;
  }
}

/**
 * An index row's order comes from the element it describes, never from the text
 * it renders as. Signature labels happen to sort the same way bare names do —
 * every GraphQL name character sorts above `(` — but relying on that would make
 * ordering hostage to the next format change (issue #24).
 */
type KeyedEntry = { readonly key: string; readonly entry: IndexEntry };

function ordered(items: readonly KeyedEntry[]): IndexEntry[] {
  return [...items]
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((item) => item.entry);
}

export interface TombstoneEntry {
  readonly path: string;
  readonly title: string;
}

export function buildBundle(
  ir: SchemaIr,
  ctx: EmitContext,
  tombstones: readonly TombstoneEntry[] = [],
): ReadonlyMap<string, FileParts> {
  const bundle = new Map<string, FileParts>();

  // Concept files.
  for (const concept of ir.concepts) {
    bundle.set(
      concept.path,
      renderConceptParts(concept, conceptResource(ir.resource, concept), ctx),
    );
  }

  // Build the directory tree from concept paths. "." is the root.
  const filesByDir = new Map<string, ConceptNode[]>();
  const childDirs = new Map<string, Set<string>>();
  const allDirs = new Set<string>(["."]);

  const ensureDir = (dir: string): void => {
    if (allDirs.has(dir)) {
      return;
    }
    allDirs.add(dir);
    const parent = posix.dirname(dir);
    const parentKey = parent === "." || parent === "" ? "." : parent;
    if (!childDirs.has(parentKey)) {
      childDirs.set(parentKey, new Set());
    }
    childDirs.get(parentKey)?.add(dir);
    if (parentKey !== ".") {
      ensureDir(parentKey);
    }
  };

  for (const concept of ir.concepts) {
    const dir = posix.dirname(concept.path);
    ensureDir(dir);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)?.push(concept);
  }

  const tombstonesByDir = new Map<string, TombstoneEntry[]>();
  for (const tombstone of tombstones) {
    const dir = posix.dirname(tombstone.path);
    ensureDir(dir);
    const bucket = tombstonesByDir.get(dir);
    if (bucket === undefined) {
      tombstonesByDir.set(dir, [tombstone]);
    } else {
      bucket.push(tombstone);
    }
  }

  // One index.md per directory.
  for (const dir of allDirs) {
    const childEntries: KeyedEntry[] = [];
    for (const child of childDirs.get(dir) ?? []) {
      const base = posix.basename(child);
      childEntries.push({
        key: `${base}/`,
        entry: {
          label: `${base}/`,
          link: bundleLink(`${child}/index.md`),
          summary: DIRECTORY_LABELS[child] ?? base,
        },
      });
    }

    const concepts = filesByDir.get(dir) ?? [];
    const conceptEntry = (concept: ConceptNode): KeyedEntry => {
      const signature = signatureOf(concept);
      const summary = firstSentence(concept.description) ?? KIND_SUMMARY[concept.kind];
      const deprecated =
        "deprecation" in concept && concept.deprecation !== null ? { deprecated: true } : {};
      return {
        key: concept.name,
        entry: {
          label: signature ?? concept.name,
          link: bundleLink(concept.path),
          summary,
          ...(signature === null ? {} : { code: true }),
          ...deprecated,
        },
      };
    };

    const tombstoneEntries: KeyedEntry[] = (tombstonesByDir.get(dir) ?? []).map((tombstone) => ({
      key: tombstone.title,
      entry: {
        label: tombstone.title,
        link: bundleLink(tombstone.path),
        summary: "(removed)",
      },
    }));

    const kinds = new Set(concepts.map((concept) => concept.kind));
    const sections: IndexSection[] = [];

    if (kinds.size > 1) {
      sections.push({ entries: ordered(childEntries) });
      for (const kind of KIND_ORDER) {
        const entries = concepts.filter((concept) => concept.kind === kind).map(conceptEntry);
        if (entries.length > 0) {
          sections.push({ heading: KIND_SECTION_LABELS[kind], entries: ordered(entries) });
        }
      }
      if (tombstoneEntries.length > 0) {
        sections.push({ heading: "Removed", entries: ordered(tombstoneEntries) });
      }
    } else {
      sections.push({
        entries: ordered([...childEntries, ...concepts.map(conceptEntry), ...tombstoneEntries]),
      });
    }

    const title = DIRECTORY_LABELS[dir] ?? posix.basename(dir);
    const indexPath = dir === "." ? "index.md" : `${dir}/index.md`;
    const frontmatter =
      dir === "."
        ? [
            `okf_version: ${JSON.stringify(ctx.okfVersion)}`,
            `resource: ${JSON.stringify(ir.resource)}`,
          ]
        : undefined;
    const notes =
      dir === "."
        ? [SPEC_DEFINED_NOTE, SEAM_NOTE]
        : concepts.some((concept) => signatureOf(concept) !== null)
          ? [SIGNATURE_NOTE]
          : undefined;
    bundle.set(indexPath, renderDirectoryIndex(title, sections, { frontmatter, notes }));
  }

  return bundle;
}
