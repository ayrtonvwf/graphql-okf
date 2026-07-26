/**
 * A GraphQL docstring may contain newlines and paragraph breaks. Anywhere it is
 * used inline — a table cell, an index summary — those must collapse, or the
 * surrounding structure breaks. The concept-level description line is the one
 * place the docstring stays verbatim (GOAL-6.3).
 */
export function collapse(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** `collapse`, plus escaping the one character a markdown table row reserves. */
export function cell(text: string): string {
  return collapse(text).replace(/\|/g, "\\|");
}
