import { posix } from "node:path";
import type { ConceptNode, SchemaIr } from "../model/ir.js";
import type { ConceptKind } from "../model/naming.js";
import { renderConcept } from "./render/concept.js";
import { type IndexEntry, renderDirectoryIndex } from "./render/directory-index.js";

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
  "types/objects": "Object types",
  "types/interfaces": "Interface types",
  "types/unions": "Union types",
  "types/enums": "Enum types",
  "types/inputs": "Input object types",
  "types/scalars": "Scalar types",
  queries: "Query operations",
  mutations: "Mutation operations",
  subscriptions: "Subscription operations",
  directives: "Directives",
};

function firstLine(description: string | null): string {
  return description === null ? "" : (description.split("\n")[0] ?? "").trim();
}

function sortByLabel(entries: IndexEntry[]): IndexEntry[] {
  return entries.sort((left, right) =>
    left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
  );
}

export function buildBundle(ir: SchemaIr, timestamp: string): ReadonlyMap<string, string> {
  const bundle = new Map<string, string>();

  // Concept files.
  for (const concept of ir.concepts) {
    bundle.set(concept.path, renderConcept(concept, ir.resource, timestamp));
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

  // One index.md per directory.
  for (const dir of allDirs) {
    const entries: IndexEntry[] = [];

    for (const child of childDirs.get(dir) ?? []) {
      const base = posix.basename(child);
      entries.push({
        label: `${base}/`,
        link: `${base}/index.md`,
        summary: DIRECTORY_LABELS[child] ?? base,
      });
    }

    for (const concept of filesByDir.get(dir) ?? []) {
      const summary = firstLine(concept.description) || KIND_SUMMARY[concept.kind];
      entries.push({
        label: concept.name,
        link: posix.basename(concept.path),
        summary,
      });
    }

    const title = DIRECTORY_LABELS[dir] ?? posix.basename(dir);
    const indexPath = dir === "." ? "index.md" : `${dir}/index.md`;
    bundle.set(indexPath, renderDirectoryIndex(title, sortByLabel(entries)));
  }

  return bundle;
}
