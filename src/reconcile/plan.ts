import { buildBundle } from "../emit/bundle.js";
import { assembleFile, EMPTY_HUMAN, type FileParts } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { mergeFrontmatter, withoutTimestamp } from "./frontmatter.js";
import { type SplitFile, splitFile } from "./parse.js";

export interface ConceptChange {
  readonly name: string;
  readonly path: string;
}

export interface FileAction {
  readonly kind: "create" | "update" | "tombstone" | "index";
  readonly path: string;
  readonly contents: string;
}

export interface BundlePlan {
  readonly actions: readonly FileAction[];
  readonly added: readonly ConceptChange[];
  readonly changed: readonly ConceptChange[];
  readonly removed: readonly ConceptChange[];
  readonly unchanged: number;
}

export function isIndexPath(path: string): boolean {
  return path === "index.md" || path.endsWith("/index.md");
}

/**
 * Files graphql-okf owns, keyed by path. A file is owned when it carries the
 * generated markers; `index.md` is owned by its reserved name, so a legacy
 * marker-less index is picked up and upgraded rather than mistaken for a stray.
 */
function ownedFiles(existing: ReadonlyMap<string, string>): Map<string, SplitFile> {
  const owned = new Map<string, SplitFile>();
  for (const [path, text] of existing) {
    if (path === "log.md") {
      continue;
    }
    const split = splitFile(text, path);
    if (split !== null) {
      owned.set(path, split);
    } else if (isIndexPath(path)) {
      owned.set(path, { parts: { preamble: text, generated: "" }, human: "" });
    }
  }
  return owned;
}

function sameContent(rendered: FileParts, existing: FileParts): boolean {
  return (
    rendered.generated === existing.generated &&
    withoutTimestamp(rendered.preamble) === withoutTimestamp(existing.preamble)
  );
}

export function reconcile(
  ir: SchemaIr,
  existing: ReadonlyMap<string, string>,
  timestamp: string,
): BundlePlan {
  const owned = ownedFiles(existing);

  const actions: FileAction[] = [];
  const added: ConceptChange[] = [];
  const changed: ConceptChange[] = [];
  const removed: ConceptChange[] = [];
  let unchanged = 0;

  const names = new Map(ir.concepts.map((concept) => [concept.path, concept.name]));

  for (const [path, rendered] of buildBundle(ir, timestamp)) {
    const current = owned.get(path);
    const index = isIndexPath(path);

    if (current === undefined) {
      actions.push({
        kind: index ? "index" : "create",
        path,
        contents: assembleFile(rendered, EMPTY_HUMAN),
      });
      if (!index) {
        added.push({ name: names.get(path) ?? path, path });
      }
      continue;
    }

    const merged: FileParts = {
      preamble: mergeFrontmatter(rendered.preamble, current.parts.preamble),
      generated: rendered.generated,
    };

    if (sameContent(merged, current.parts)) {
      if (!index) {
        unchanged += 1;
      }
      continue;
    }

    actions.push({
      kind: index ? "index" : "update",
      path,
      contents: assembleFile(merged, current.human),
    });
    if (!index) {
      changed.push({ name: names.get(path) ?? path, path });
    }
  }

  return { actions, added, changed, removed, unchanged };
}
