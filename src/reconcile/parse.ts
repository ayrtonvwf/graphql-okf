import { type FileParts, GENERATED_END, GENERATED_START, HUMAN_HINT } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";

export interface SplitFile {
  readonly parts: FileParts;
  readonly human: string;
}

function malformed(path: string, detail: string): GraphqlOkfError {
  return new GraphqlOkfError(
    "MALFORMED_CONCEPT",
    `"${path}" has malformed graphql-okf markers (${detail}). Restore the generated-region markers or delete the file, then re-run.`,
  );
}

/**
 * The bundle-root index is owned by its reserved name rather than by the
 * generated-region markers: a legacy v0.1 index has no markers at all, and a
 * freshly rendered one still needs to be recognised before it has ever been
 * split.
 */
export function isIndexPath(path: string): boolean {
  return path === "index.md" || path.endsWith("/index.md");
}

/**
 * Whether graphql-okf owns this file — the single predicate migration,
 * downgrade-detection, and reconciliation must all agree on. A file is owned
 * when it is the (root or nested) index, or when it carries the
 * generated-region markers; anything else is a human's, however its
 * frontmatter happens to look, and must never be rewritten (GOAL-8.3).
 */
export function isOwnedFile(path: string, text: string): boolean {
  return isIndexPath(path) || splitFile(text, path) !== null;
}

/**
 * Splits a file graphql-okf owns into its three regions. Returns null for a
 * stray — any file without the markers, which graphql-okf never touches.
 */
export function splitFile(text: string, path: string): SplitFile | null {
  const start = text.indexOf(GENERATED_START);
  const end = text.indexOf(GENERATED_END);

  if (start === -1 && end === -1) {
    return null;
  }
  if (start === -1) {
    throw malformed(path, "an end marker with no start marker");
  }
  if (end === -1) {
    throw malformed(path, "a start marker with no end marker");
  }
  if (end < start) {
    throw malformed(path, "the end marker precedes the start marker");
  }
  if (text.indexOf(GENERATED_START, start + GENERATED_START.length) !== -1) {
    throw malformed(path, "more than one start marker");
  }
  if (text.indexOf(GENERATED_END, end + GENERATED_END.length) !== -1) {
    throw malformed(path, "more than one end marker");
  }

  return {
    parts: {
      preamble: text.slice(0, start),
      generated: text.slice(start + GENERATED_START.length, end),
    },
    human: text.slice(end + GENERATED_END.length),
  };
}

/**
 * Whether a file's human region holds anything the machine did not put there.
 * The single predicate every pre-pass uses to decide whether a file is safe to
 * delete: a human's words are never destroyed, however the generated region
 * looks (GOAL-8.3).
 */
export function hasHumanText(human: string): boolean {
  return human.replace(HUMAN_HINT, "").trim() !== "";
}
