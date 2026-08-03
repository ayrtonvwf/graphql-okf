import { assembleFile, HUMAN_HINT } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";
import { isOwnedFile, splitFile } from "./parse.js";

/**
 * The six directories type concepts used to live in, before issue #22 flattened
 * them into `types/`. A fixed list rather than a derivation: it is a historical
 * fact about bundles already on disk, not a function of the current naming
 * scheme, and it must keep working after that scheme forgets these names ever
 * existed.
 */
const LEGACY_TYPE_DIRS = [
  "types/objects",
  "types/interfaces",
  "types/unions",
  "types/enums",
  "types/inputs",
  "types/scalars",
] as const;

const REDIRECT_ROW =
  "* [Types](/types/index.md) - This directory was flattened into the parent index.";
const REDIRECT_REGION = `\n${REDIRECT_ROW}\n`;

export interface Move {
  readonly from: string;
  readonly to: string;
}

export interface Redirect {
  readonly path: string;
  readonly contents: string;
}

export interface RelayoutResult {
  readonly files: ReadonlyMap<string, string>;
  /** Old path → new path, sorted by old path. */
  readonly moves: readonly Move[];
  /** Legacy kind indexes rewritten to point at the parent index, sorted by path. */
  readonly redirects: readonly Redirect[];
  /** Paths to remove from disk, sorted. */
  readonly deletes: readonly string[];
}

/** The legacy kind directory this path sits directly inside, if any. */
function legacyBasename(path: string): string | null {
  for (const dir of LEGACY_TYPE_DIRS) {
    if (!path.startsWith(`${dir}/`)) {
      continue;
    }
    const basename = path.slice(dir.length + 1);
    // Nothing graphql-okf writes nests deeper; a human's subdirectory is theirs.
    return basename.includes("/") ? null : basename;
  }
  return null;
}

function hasHumanText(human: string): boolean {
  return human.replace(HUMAN_HINT, "").trim() !== "";
}

/**
 * Rewrites an existing bundle from the nested `types/<kind>/` layout to the flat
 * one, in memory, before reconciliation sees it. A pre-pass rather than a render
 * path for the same reason the v0.1 → v0.2 conversion is: a tombstoned concept is
 * not in the IR, so the emitter never re-renders it, and a render-based move would
 * strand every tombstone in the old layout forever.
 *
 * Deletes only files graphql-okf owns. A human's stray file keeps its place, and
 * its directory with it.
 */
export function relayoutBundle(existing: ReadonlyMap<string, string>): RelayoutResult {
  const files = new Map(existing);
  const moves: Move[] = [];
  const redirects: Redirect[] = [];
  const deletes: string[] = [];

  for (const [path, text] of existing) {
    const basename = legacyBasename(path);
    if (basename === null) {
      continue;
    }

    if (basename === "index.md") {
      const split = splitFile(text, path);
      if (split === null || !hasHumanText(split.human)) {
        files.delete(path);
        deletes.push(path);
        continue;
      }
      if (split.parts.generated === REDIRECT_REGION) {
        continue;
      }
      const contents = assembleFile(
        { preamble: split.parts.preamble, generated: REDIRECT_REGION },
        split.human,
      );
      files.set(path, contents);
      redirects.push({ path, contents });
      continue;
    }

    if (!isOwnedFile(path, text)) {
      continue;
    }

    const to = `types/${basename}`;
    const target = existing.get(to);
    if (target !== undefined) {
      // An interrupted earlier run wrote the move but not the delete. Identical
      // bytes mean the move completed; anything else is a genuine conflict.
      if (target !== text) {
        throw new GraphqlOkfError(
          "LAYOUT_MOVE_CONFLICT",
          `"${path}" and "${to}" both exist and differ. Delete whichever is stale, then re-run.`,
        );
      }
      files.delete(path);
      deletes.push(path);
      continue;
    }

    files.delete(path);
    files.set(to, text);
    moves.push({ from: path, to });
    deletes.push(path);
  }

  moves.sort((left, right) => (left.from < right.from ? -1 : left.from > right.from ? 1 : 0));
  redirects.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  deletes.sort();

  return { files, moves, redirects, deletes };
}
