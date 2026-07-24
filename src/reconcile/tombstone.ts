import type { FileParts } from "../emit/render/seam.js";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { frontmatterValue } from "./frontmatter.js";
import type { SplitFile } from "./parse.js";

export function isTombstoned(split: SplitFile): boolean {
  return frontmatterValue(split.parts.preamble, "status") === "removed";
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

export function renderTombstone(split: SplitFile, removedAt: string): FileParts {
  const preamble = split.parts.preamble.replace(
    /\n---\n(\s*)$/,
    `\nstatus: removed\nremovedAt: ${removedAt}\n---\n$1`,
  );
  const day = removedAt.slice(0, 10);
  const generated = [
    "",
    `> **Removed.** This element is no longer present in the schema as of ${day}.`,
    "",
    "## Last known definition",
    "",
    lastKnownBody(split.parts.generated),
    "",
    "",
  ].join("\n");

  return { preamble, generated };
}
