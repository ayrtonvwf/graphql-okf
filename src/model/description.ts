/**
 * A GraphQL description that is present but empty carries no information, and
 * emitting it produces a `description: ""` field and a stray empty paragraph.
 */
export function normalizeDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/**
 * OKF §4.1 defines `description` as a single sentence used for index entries,
 * search snippets and previews. The full docstring is preserved verbatim in the
 * body (GOAL-6.3), so this is a preview, not the record.
 *
 * The rule is deliberately naive: an abbreviation such as "e.g." cuts early. An
 * abbreviation dictionary would be unbounded and locale-sensitive, and would
 * make output depend on a word list rather than on the schema (NG-6).
 */
export function firstSentence(description: string | null): string | null {
  if (description === null) {
    return null;
  }
  const collapsed = description.replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return null;
  }
  const match = /[.!?](\s|$)/.exec(collapsed);
  return match === null ? collapsed : collapsed.slice(0, match.index + 1);
}
