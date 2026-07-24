export const GENERATED_START = "<!-- graphql-okf:generated:start -->";
export const GENERATED_END = "<!-- graphql-okf:generated:end -->";

export const GENERATED_HINT =
  "<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->";
export const HUMAN_HINT =
  "<!-- Human-authored content below this line is preserved across regenerations. -->";

/** The human region of a file graphql-okf has just created for the first time. */
export const EMPTY_HUMAN = `\n\n${HUMAN_HINT}\n`;

/**
 * A file graphql-okf owns, minus its human region: everything before the start
 * marker, and everything between the markers.
 */
export interface FileParts {
  readonly preamble: string;
  readonly generated: string;
}

export function assembleFile(parts: FileParts, human: string): string {
  return `${parts.preamble}${GENERATED_START}${parts.generated}${GENERATED_END}${human}`;
}
