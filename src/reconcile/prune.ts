import { SPEC_DEFINED_PATHS } from "../model/naming.js";
import { hasHumanText, splitFile } from "./parse.js";

export interface PruneResult {
  readonly files: ReadonlyMap<string, string>;
  /** Paths removed from the bundle, sorted — the plan's action order must not depend on map order. */
  readonly pruned: readonly string[];
}

/**
 * Deletes the concept files of spec-defined elements from an existing bundle, in
 * memory, before reconciliation sees it. A pre-pass rather than the normal
 * removal path on purpose: reconcile would tombstone these files, and a tombstone
 * is *larger* than the file it replaces — it keeps the last known definition plus
 * a removal banner — which is the exact opposite of what issue #23 is for.
 *
 * Runs after `relayoutBundle`, which is what turns a legacy `types/scalars/ID.md`
 * into the flat `types/ID.md` these paths are stated in, and before
 * `migrateBundle`, so no frontmatter is converted on a file about to disappear.
 *
 * Deletes only files graphql-okf owns and only when nobody has written into them.
 * A file failing either guard stays, is absent from the IR, and is tombstoned by
 * the normal path — the human's words survive under a removal banner rather than
 * vanishing.
 */
export function pruneBundle(existing: ReadonlyMap<string, string>): PruneResult {
  const files = new Map(existing);
  const pruned: string[] = [];

  // SPEC_DEFINED_PATHS is sorted, so `pruned` comes out sorted for free.
  for (const path of SPEC_DEFINED_PATHS) {
    const text = existing.get(path);
    if (text === undefined) {
      continue;
    }
    // None of these paths is an index, so "splits" and "is owned" are the same
    // question here — `isOwnedFile` would just ask it twice.
    const split = splitFile(text, path);
    if (split === null || hasHumanText(split.human)) {
      continue;
    }
    files.delete(path);
    pruned.push(path);
  }

  return { files, pruned };
}
