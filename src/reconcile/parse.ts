import { type FileParts, GENERATED_END, GENERATED_START } from "../emit/render/seam.js";
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
