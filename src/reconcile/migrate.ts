import type { EmitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, LEGACY_HUMAN_HINT } from "../emit/render/seam.js";
import { frontmatterValue, replaceEntry } from "./frontmatter.js";
import { isOwnedFile, splitFile } from "./parse.js";

const LOG_FILE = "log.md";
const REMOVED = "removed";
const LEGACY_TOMBSTONE_KEY = "status";
const TOMBSTONE_KEY = "graphql_okf_status";

export interface MigrationResult {
  readonly files: ReadonlyMap<string, string>;
  /** Paths this pass rewrote, sorted — the plan's action order must not depend on map order. */
  readonly migrated: readonly string[];
  /** The subset of `migrated` whose provenance or tombstone key was converted (v0.1 -> v0.2). */
  readonly frontmatterMigrated: readonly string[];
  /** The subset of `migrated` whose legacy human hint was stripped (#24). Overlaps the above. */
  readonly hintStripped: readonly string[];
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
function migrateProvenance(text: string, ctx: EmitContext): string | null {
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

function isLegacyRemoved(raw: string | null): boolean {
  return raw === REMOVED || raw === `"${REMOVED}"`;
}

/**
 * Legacy tombstone key for one file. Only the exact `"removed"` sentinel is
 * ours to touch — `deprecated`/`draft`/`stable` are real §5.4 vocabulary that
 * migration must leave alone.
 */
function migrateTombstoneKey(text: string): string | null {
  if (!isLegacyRemoved(frontmatterValue(text, LEGACY_TOMBSTONE_KEY))) {
    return null;
  }
  return replaceEntry(text, LEGACY_TOMBSTONE_KEY, `${TOMBSTONE_KEY}: "${REMOVED}"`);
}

/** The human region the emitter wrote at file creation before issue #24. */
const LEGACY_EMPTY_HUMAN = `\n\n${LEGACY_HUMAN_HINT}\n`;

/**
 * Issue #24 stopped emitting the human-region hint, but an existing bundle's copy
 * sits inside the region the reconciler must never rewrite (GOAL-8.3). The
 * exception is made safe by being unable to fire on anything a human wrote: the
 * whole region must be byte-identical to what the emitter itself put there at
 * creation. A region with so much as a blank line added is left alone.
 */
function migrateHumanHint(text: string, path: string): string | null {
  const split = splitFile(text, path);
  if (split === null || split.human !== LEGACY_EMPTY_HUMAN) {
    return null;
  }
  return assembleFile(split.parts, EMPTY_HUMAN);
}

interface ConceptMigration {
  readonly text: string;
  /** Whether provenance or the tombstone key changed, so the caller can log it separately. */
  readonly frontmatterMigrated: boolean;
  /** Whether this file's hint strip fired, so the caller can log it separately. */
  readonly hintStripped: boolean;
}

/**
 * Every conversion for one file. The v0.1 -> v0.2 pair is version-gated; the
 * hint strip is not, because the hint has nothing to do with the OKF version.
 * The two are tracked separately (not just as one `changed` bit) so the log can
 * describe what actually happened rather than always naming the v0.1 -> v0.2
 * conversion, which a hint-only strip never performs.
 */
function migrateConcept(text: string, path: string, ctx: EmitContext): ConceptMigration | null {
  let current = text;
  let frontmatterMigrated = false;

  if (ctx.okfVersion === "0.2") {
    const withProvenance = migrateProvenance(current, ctx);
    if (withProvenance !== null) {
      current = withProvenance;
      frontmatterMigrated = true;
    }

    const withTombstoneKey = migrateTombstoneKey(current);
    if (withTombstoneKey !== null) {
      current = withTombstoneKey;
      frontmatterMigrated = true;
    }
  }

  const withoutHint = migrateHumanHint(current, path);
  const hintStripped = withoutHint !== null;
  if (hintStripped) {
    current = withoutHint;
  }

  return frontmatterMigrated || hintStripped
    ? { text: current, frontmatterMigrated, hintStripped }
    : null;
}

/**
 * Converts an existing bundle's frontmatter in place, before reconciliation.
 * A pre-pass rather than a render path: an already-tombstoned concept is not in
 * the IR, so the emitter never re-renders it, and a render-based migration would
 * strand every tombstone in v0.1 form forever.
 *
 * The bundle-root index needs no frontmatter rule here — it is re-rendered every
 * run and its okf_version comes from the emit context — but it does carry a human
 * region, so the hint strip applies to it like any other owned file.
 */
export function migrateBundle(
  existing: ReadonlyMap<string, string>,
  ctx: EmitContext,
): MigrationResult {
  const files = new Map(existing);
  const migrated: string[] = [];
  const frontmatterMigrated: string[] = [];
  const hintStripped: string[] = [];

  for (const [path, text] of existing) {
    if (path === LOG_FILE || !isOwnedFile(path, text)) {
      continue;
    }
    const result = migrateConcept(text, path, ctx);
    if (result !== null && result.text !== text) {
      files.set(path, result.text);
      migrated.push(path);
      if (result.frontmatterMigrated) {
        frontmatterMigrated.push(path);
      }
      if (result.hintStripped) {
        hintStripped.push(path);
      }
    }
  }

  migrated.sort();
  frontmatterMigrated.sort();
  hintStripped.sort();
  return { files, migrated, frontmatterMigrated, hintStripped };
}
