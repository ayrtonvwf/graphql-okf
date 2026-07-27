import type { EmitContext } from "../emit/context.js";
import { frontmatterValue, replaceEntry } from "./frontmatter.js";

const LOG_FILE = "log.md";

export interface MigrationResult {
  readonly files: ReadonlyMap<string, string>;
  /** Paths this pass rewrote, sorted — the plan's action order must not depend on map order. */
  readonly migrated: readonly string[];
}

function unquote(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw;
  }
}

/**
 * v0.1 → v0.2 provenance for one file. `at` keeps the file's existing timestamp:
 * restamping with the run's own time would destroy every concept's provenance
 * in a single pass. `by` is the current producer — we cannot know which release
 * originally wrote the file, and §5.1 requires `by` within the mapping.
 */
function migrateConcept(text: string, ctx: EmitContext): string | null {
  if (frontmatterValue(text, "generated") !== null) {
    return null;
  }
  const timestamp = frontmatterValue(text, "timestamp");
  if (timestamp === null) {
    return null;
  }
  const at = JSON.stringify(unquote(timestamp));
  return replaceEntry(
    text,
    "timestamp",
    `generated: { by: ${JSON.stringify(ctx.producer)}, at: ${at} }`,
  );
}

/**
 * Converts an existing bundle's frontmatter in place, before reconciliation.
 * A pre-pass rather than a render path: an already-tombstoned concept is not in
 * the IR, so the emitter never re-renders it, and a render-based migration would
 * strand every tombstone in v0.1 form forever.
 *
 * The bundle-root index needs no rule here — it is re-rendered every run and its
 * okf_version comes from the emit context.
 */
export function migrateBundle(
  existing: ReadonlyMap<string, string>,
  ctx: EmitContext,
): MigrationResult {
  if (ctx.okfVersion !== "0.2") {
    return { files: existing, migrated: [] };
  }

  const files = new Map(existing);
  const migrated: string[] = [];

  for (const [path, text] of existing) {
    if (path === LOG_FILE) {
      continue;
    }
    const next = migrateConcept(text, ctx);
    if (next !== null && next !== text) {
      files.set(path, next);
      migrated.push(path);
    }
  }

  migrated.sort();
  return { files, migrated };
}
