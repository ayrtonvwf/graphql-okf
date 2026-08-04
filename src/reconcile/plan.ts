import { buildBundle, type TombstoneEntry } from "../emit/bundle.js";
import type { EmitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, type FileParts } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { mergeFrontmatter, withoutProvenance } from "./frontmatter.js";
import { migrateBundle } from "./migrate.js";
import { hasHumanText, isIndexPath, type SplitFile, splitFile } from "./parse.js";
import { pruneBundle } from "./prune.js";
import { REDIRECT_REGION, relayoutBundle } from "./relayout.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";

export interface ConceptChange {
  readonly name: string;
  readonly path: string;
}

/**
 * A delete carries no contents, and the union says so rather than passing an
 * unused empty string. Deleting is new as of issue #22's flatten: before it,
 * graphql-okf only ever wrote.
 */
export type FileAction =
  | { readonly kind: "delete"; readonly path: string }
  | {
      readonly kind: "create" | "update" | "tombstone" | "index" | "migrate";
      readonly path: string;
      readonly contents: string;
    };

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
   * Whole-bundle format conversions this run performed. Reported as counts in
   * log.md, not lists: naming five thousand paths is noise.
   *
   * `frontmatter` — concepts converted from OKF v0.1 to v0.2.
   * `relocated`   — new paths of concepts moved into the flattened `types/`.
   */
  readonly migrated: {
    readonly frontmatter: readonly string[];
    readonly relocated: readonly string[];
    /** `pruned` — spec-defined concepts deleted because they are no longer emitted (#23). */
    readonly pruned: readonly string[];
  };
}

interface OwnedFiles {
  readonly files: Map<string, SplitFile>;
  /**
   * Index paths adopted by reserved name rather than by markers (a legacy or
   * hand-written marker-less `index.md`). For these, `SplitFile.human` is
   * forced to `""` by construction — the whole file landed in `preamble`
   * because there is no generated-region boundary to split on — not because
   * the file genuinely has no human content. Any pass that would delete or
   * rewrite an orphaned index based on `hasHumanText` must treat a path in
   * this set as "can't tell", not "safe to delete" (finding 1, #23 review).
   */
  readonly markerless: ReadonlySet<string>;
}

/**
 * Files graphql-okf owns, keyed by path. A file is owned when it carries the
 * generated markers; `index.md` is owned by its reserved name, so a legacy
 * marker-less index is picked up and upgraded rather than mistaken for a stray.
 */
function ownedFiles(existing: ReadonlyMap<string, string>): OwnedFiles {
  const owned = new Map<string, SplitFile>();
  const markerless = new Set<string>();
  for (const [path, text] of existing) {
    if (path === "log.md") {
      continue;
    }
    const split = splitFile(text, path);
    if (split !== null) {
      owned.set(path, split);
    } else if (isIndexPath(path)) {
      owned.set(path, { parts: { preamble: text, generated: "" }, human: "" });
      markerless.add(path);
    }
  }
  return { files: owned, markerless };
}

/**
 * Whether `path`'s directory (on disk, before this run's own writes) still
 * holds any file other than `path` itself — including in nested
 * subdirectories, mirroring the physical `rmdir`-fails-if-non-empty check
 * `apply.ts`'s `removeIfEmpty` performs. Used to decide whether an orphaned
 * index's directory is genuinely empty or still anchors a human's stray file
 * (finding 2, #23 review).
 */
function dirStillHasOtherFiles(path: string, files: ReadonlyMap<string, string>): boolean {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  for (const other of files.keys()) {
    if (other !== path && other.startsWith(dir)) {
      return true;
    }
  }
  return false;
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
  const relayout = relayoutBundle(existing);
  const pruned = pruneBundle(relayout.files);
  const { files, migrated } = migrateBundle(pruned.files, ctx);
  const { files: owned, markerless } = ownedFiles(files);

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

  const built = buildBundle(ir, ctx, tombstones);

  for (const [path, rendered] of built) {
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

  // Migration rewrites exactly the region sameContent ignores, and a relocated
  // concept is sameContent at its new path — so the loop above sees both as
  // unchanged. Their writes have to be added explicitly, and only where reconcile
  // did not already write a newer version of the file.
  const acted = new Set(actions.map((action) => action.path));

  for (const path of migrated) {
    const contents = files.get(path);
    if (acted.has(path) || contents === undefined) {
      continue;
    }
    actions.push({ kind: "migrate", path, contents });
    acted.add(path);
  }

  for (const move of relayout.moves) {
    const contents = files.get(move.to);
    if (acted.has(move.to) || contents === undefined) {
      continue;
    }
    actions.push({ kind: "migrate", path: move.to, contents });
    acted.add(move.to);
  }

  for (const redirect of relayout.redirects) {
    if (acted.has(redirect.path)) {
      continue;
    }
    actions.push({ kind: "index", path: redirect.path, contents: redirect.contents });
    acted.add(redirect.path);
  }

  // A directory that loses its last concept (outright-deleted by prune, not
  // tombstoned) is absent from `allDirs` in bundle.ts, so `built` never gets an
  // entry for its index — `buildBundle` only emits an index for a directory that
  // still has a live concept, tombstone, or child directory. That leaves the
  // owned index on disk pointing at files that no longer exist. The root index
  // is exempt: bundle.ts always seeds "." into `allDirs`, so it is always in
  // `built` and never matches this check.
  //
  // A human-annotated orphaned index is never deleted (GOAL-8.3): mirroring
  // relayout.ts's own precedent for a legacy kind index carrying human text,
  // it is rewritten with an empty generated region — dropping the stale,
  // now-broken links — while `split.human` is preserved verbatim. The same
  // keep-alive applies when the directory isn't actually empty — a human's
  // stray file left in it would otherwise become unreachable from the bundle's
  // link graph, violating GOAL-7.4 (finding 2, #23 review).
  //
  // A marker-less orphaned index (`markerless`, finding 1) is never touched
  // here at all: `hasHumanText(split.human)` is structurally always false for
  // it (the whole file landed in `preamble`, not because it has no human
  // content), so this pass cannot tell delete-safe from a hand-written page.
  // Mirroring prune.ts's polarity for an unsplittable file, "can't tell" means
  // "leave it alone" — no delete, no rewrite.
  for (const [path, split] of owned) {
    if (
      isIndexPath(path) &&
      !built.has(path) &&
      !acted.has(path) &&
      split.parts.generated !== REDIRECT_REGION &&
      !markerless.has(path)
    ) {
      if (hasHumanText(split.human) || dirStillHasOtherFiles(path, files)) {
        // Already settled into its rewritten form (empty generated region) —
        // re-emitting here every run would break the "unchanged bundle is a
        // no-op" guarantee, even though the output would be identical.
        if (split.parts.generated !== "") {
          actions.push({
            kind: "index",
            path,
            contents: assembleFile({ preamble: split.parts.preamble, generated: "" }, split.human),
          });
          indexes += 1;
        }
      } else {
        actions.push({ kind: "delete", path });
      }
      acted.add(path);
    }
  }

  for (const path of [...relayout.deletes, ...pruned.pruned]) {
    actions.push({ kind: "delete", path });
  }

  return {
    actions,
    added,
    changed,
    removed,
    unchanged,
    indexes,
    migrated: {
      frontmatter: migrated,
      relocated: relayout.moves.map((move) => move.to),
      pruned: pruned.pruned,
    },
  };
}
