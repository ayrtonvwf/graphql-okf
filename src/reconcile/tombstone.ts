import type { EmitContext } from "../emit/context.js";
import type { FileParts } from "../emit/render/seam.js";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { frontmatterValue } from "./frontmatter.js";
import type { SplitFile } from "./parse.js";

/**
 * Our own removal marker. OKF v0.2 §5.4 gave `status` a closed vocabulary
 * (draft|stable|deprecated), so "removed" no longer belongs there — and
 * "deprecated" is the wrong word for it anyway, since GraphQL's own @deprecated
 * needs that meaning. Namespaced until M2 decides how to surface both.
 */
const TOMBSTONE_KEY = "graphql_okf_status";

const REMOVED = "removed";

function isRemoved(raw: string | null): boolean {
  return raw === REMOVED || raw === `"${REMOVED}"`;
}

export function isTombstoned(split: SplitFile): boolean {
  return (
    isRemoved(frontmatterValue(split.parts.preamble, TOMBSTONE_KEY)) ||
    // Bundles written before the rename overloaded the spec key. Without this
    // fallback every existing tombstone resurrects as an "added" concept.
    isRemoved(frontmatterValue(split.parts.preamble, "status"))
  );
}

export function titleOf(split: SplitFile, path: string): string {
  const raw = frontmatterValue(split.parts.preamble, "title");
  const fallback = (path.split("/").pop() ?? path).replace(/\.md$/, "");
  if (raw === null) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** The previous generated region, minus the "regenerated on each run" hint. */
function lastKnownBody(generated: string): string {
  return generated.replace(GENERATED_HINT, "").trim();
}

export function renderTombstone(split: SplitFile, ctx: EmitContext): FileParts {
  const preamble = split.parts.preamble.replace(
    /\n---\n(\s*)$/,
    `\n${TOMBSTONE_KEY}: "${REMOVED}"\nremovedAt: ${JSON.stringify(ctx.timestamp)}\n---\n$1`,
  );
  const day = ctx.timestamp.slice(0, 10);
  const generated = [
    "",
    `> **Removed.** This element is no longer present in the schema as of ${day}.`,
    "",
    "# Last known definition",
    "",
    lastKnownBody(split.parts.generated),
    "",
    "",
  ].join("\n");

  return { preamble, generated };
}
