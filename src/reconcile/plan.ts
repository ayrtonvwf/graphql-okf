import { buildBundle, type TombstoneEntry } from "../emit/bundle.js";
import type { EmitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, type FileParts } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { mergeFrontmatter, withoutProvenance } from "./frontmatter.js";
import { migrateBundle } from "./migrate.js";
import { isIndexPath, type SplitFile, splitFile } from "./parse.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";

export interface ConceptChange {
  readonly name: string;
  readonly path: string;
}

interface FileAction {
  readonly kind: "create" | "update" | "tombstone" | "index" | "migrate";
  readonly path: string;
  readonly contents: string;
}

export interface BundlePlan {
  readonly actions: readonly FileAction[];
  readonly added: readonly ConceptChange[];
  readonly changed: readonly ConceptChange[];
  readonly removed: readonly ConceptChange[];
  readonly unchanged: number;
  /**
   * Index files this run writes. Indexes change whenever their concepts do, so
   * they are not listed in log.md — but they must be reported, or a rewrite of
   * the root index (which carries okf_version) is invisible.
   */
  readonly indexes: number;
  /**
   * Concepts whose frontmatter this run converted from v0.1 to v0.2. Reported
   * as a count in log.md, not a list: naming five thousand paths is noise.
   */
  readonly migrated: readonly string[];
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
    withoutProvenance(rendered.preamble) === withoutProvenance(existing.preamble)
  );
}

export function reconcile(
  ir: SchemaIr,
  existing: ReadonlyMap<string, string>,
  ctx: EmitContext,
): BundlePlan {
  const { files, migrated } = migrateBundle(existing, ctx);
  const owned = ownedFiles(files);

  const irPaths = new Set(ir.concepts.map((concept) => concept.path));
  const tombstones: TombstoneEntry[] = [];
  const newlyRemoved: { change: ConceptChange; split: SplitFile }[] = [];

  for (const [path, split] of owned) {
    if (isIndexPath(path) || irPaths.has(path)) {
      continue;
    }
    const title = titleOf(split, path);
    tombstones.push({ path, title });
    if (!isTombstoned(split)) {
      newlyRemoved.push({ change: { name: title, path }, split });
    }
  }

  const actions: FileAction[] = [];
  const added: ConceptChange[] = [];
  const changed: ConceptChange[] = [];
  const removed: ConceptChange[] = [];
  let unchanged = 0;
  let indexes = 0;

  const names = new Map(ir.concepts.map((concept) => [concept.path, concept.name]));

  for (const [path, rendered] of buildBundle(ir, ctx, tombstones)) {
    const current = owned.get(path);
    const index = isIndexPath(path);

    if (current === undefined) {
      actions.push({
        kind: index ? "index" : "create",
        path,
        contents: assembleFile(rendered, EMPTY_HUMAN),
      });
      if (index) {
        indexes += 1;
      } else {
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
    if (index) {
      indexes += 1;
    } else {
      const change: ConceptChange = { name: names.get(path) ?? path, path };
      if (isTombstoned(current)) {
        added.push(change);
      } else {
        changed.push(change);
      }
    }
  }

  for (const { change, split } of newlyRemoved) {
    actions.push({
      kind: "tombstone",
      path: change.path,
      contents: assembleFile(renderTombstone(split, ctx), split.human),
    });
    removed.push(change);
  }

  // Migration rewrites exactly the region sameContent ignores, so the loop above
  // sees these files as unchanged. Their writes have to be added explicitly —
  // and only where reconcile did not already write a newer version of the file.
  const acted = new Set(actions.map((action) => action.path));
  for (const path of migrated) {
    const contents = files.get(path);
    if (acted.has(path) || contents === undefined) {
      continue;
    }
    actions.push({ kind: "migrate", path, contents });
  }

  return { actions, added, changed, removed, unchanged, indexes, migrated };
}
