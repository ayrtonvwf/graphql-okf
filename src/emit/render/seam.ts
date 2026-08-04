export const GENERATED_START = "<!-- graphql-okf:generated:start -->";
export const GENERATED_END = "<!-- graphql-okf:generated:end -->";

/**
 * The hint comments graphql-okf wrote into every file before issue #24. Nothing
 * emits them now — the convention they stated lives once on the bundle root
 * index and in the README, where someone looking for it will find it.
 *
 * They survive as constants because reader paths still meet them in bundles
 * written by an older release: `hasHumanText` must not mistake one for a human's
 * words, and `lastKnownBody` must not copy one into a tombstone.
 */
export const LEGACY_GENERATED_HINT =
  "<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->";
export const LEGACY_HUMAN_HINT =
  "<!-- Human-authored content below this line is preserved across regenerations. -->";

/** The human region of a file graphql-okf has just created for the first time. */
export const EMPTY_HUMAN = "\n";

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
